package main

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/types"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

const (
	maxCSVBytes = 50 * 1024 * 1024
	maxPDFBytes = 50 * 1024 * 1024
	batchSize   = 250
)

type importWork struct {
	kind string
	id   string
}

type importService struct {
	app     *pocketbase.PocketBase
	queue   chan importWork
	mu      sync.Mutex
	pending map[string]struct{}
}

func newImportService(app *pocketbase.PocketBase) *importService {
	return &importService{
		app:     app,
		queue:   make(chan importWork, 1024),
		pending: map[string]struct{}{},
	}
}

func (s *importService) register() {
	s.app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.POST(
			"/api/fangji/projects/:projectId/imports/csv",
			s.uploadCSV,
			middleware.BodyLimit(51*1024*1024),
			apis.RequireRecordAuth("users"),
		)
		e.Router.POST(
			"/api/fangji/projects/:projectId/files/pdf",
			s.uploadPDF,
			middleware.BodyLimit(51*1024*1024),
			apis.RequireRecordAuth("users"),
		)

		go s.runWorker()
		go s.recoverPendingWork()
		return nil
	})
}

func (s *importService) requireAdmin(c echo.Context) (*models.Record, error) {
	auth, _ := c.Get(apis.ContextAuthRecordKey).(*models.Record)
	if auth == nil {
		return nil, apis.NewUnauthorizedError("登录状态已失效，请重新登录。", nil)
	}
	if auth.GetString("role") != "admin" {
		return nil, apis.NewForbiddenError("只有管理员可以上传项目文件。", nil)
	}
	return auth, nil
}

func (s *importService) findProject(projectID string) (*models.Record, error) {
	project, err := s.app.Dao().FindRecordById("projects", projectID)
	if err != nil || project == nil {
		return nil, apis.NewNotFoundError("项目不存在或已被删除。", err)
	}
	return project, nil
}

func (s *importService) uploadCSV(c echo.Context) error {
	auth, err := s.requireAdmin(c)
	if err != nil {
		return err
	}
	projectID := c.PathParam("projectId")
	if _, err := s.findProject(projectID); err != nil {
		return err
	}

	header, err := c.FormFile("file")
	if err != nil {
		return apis.NewBadRequestError("请选择要导入的 CSV 文件。", err)
	}
	if err := validateUploadHeader(header, ".csv", maxCSVBytes); err != nil {
		return apis.NewBadRequestError(err.Error(), nil)
	}

	hash, err := hashMultipartFile(header)
	if err != nil {
		return apis.NewBadRequestError("无法读取上传的 CSV 文件。", err)
	}

	filter := fmt.Sprintf(
		`project = %q && file_hash = %q && mode = "skip_invalid" && status != "failed"`,
		projectID,
		hash,
	)
	existing, _ := s.app.Dao().FindRecordsByFilter("import_jobs", filter, "-created", 1, 0)
	if len(existing) > 0 {
		return c.JSON(http.StatusOK, existing[0])
	}

	collection, err := s.app.Dao().FindCollectionByNameOrId("import_jobs")
	if err != nil {
		return apis.NewBadRequestError("导入功能尚未完成数据库初始化。", err)
	}
	record := models.NewRecord(collection)
	form := forms.NewRecordUpsert(s.app, record)
	if err := form.LoadData(map[string]any{
		"project":           projectID,
		"created_by":        auth.Id,
		"original_filename": header.Filename,
		"file_hash":         hash,
		"file_size":         header.Size,
		"mode":              "skip_invalid",
		"status":            "queued",
		"total_count":       0,
		"processed_count":   0,
		"success_count":     0,
		"failed_count":      0,
	}); err != nil {
		return apis.NewBadRequestError("无法创建 CSV 导入作业。", err)
	}
	file, err := filesystem.NewFileFromMultipart(header)
	if err != nil {
		return apis.NewBadRequestError("无法读取上传的 CSV 文件。", err)
	}
	if err := form.AddFiles("source_file", file); err != nil {
		return apis.NewBadRequestError("无法保存上传的 CSV 文件。", err)
	}
	if err := form.Submit(); err != nil {
		// A concurrent duplicate upload may have won the unique index race.
		existing, _ := s.app.Dao().FindRecordsByFilter("import_jobs", filter, "-created", 1, 0)
		if len(existing) > 0 {
			return c.JSON(http.StatusOK, existing[0])
		}
		return apis.NewBadRequestError("创建 CSV 导入作业失败。", err)
	}

	s.enqueue(importWork{kind: "csv", id: record.Id})
	return c.JSON(http.StatusAccepted, record)
}

func (s *importService) uploadPDF(c echo.Context) error {
	_, err := s.requireAdmin(c)
	if err != nil {
		return err
	}
	projectID := c.PathParam("projectId")
	if _, err := s.findProject(projectID); err != nil {
		return err
	}

	header, err := c.FormFile("file")
	if err != nil {
		return apis.NewBadRequestError("请选择要上传的 PDF 文件。", err)
	}
	if err := validateUploadHeader(header, ".pdf", maxPDFBytes); err != nil {
		return apis.NewBadRequestError(err.Error(), nil)
	}
	validSignature, err := multipartHasPrefix(header, []byte("%PDF-"))
	if err != nil {
		return apis.NewBadRequestError("无法读取上传的 PDF 文件。", err)
	}
	if !validSignature {
		return apis.NewBadRequestError("文件内容不是有效的 PDF。", nil)
	}
	hash, err := hashMultipartFile(header)
	if err != nil {
		return apis.NewBadRequestError("无法读取上传的 PDF 文件。", err)
	}

	collection, err := s.app.Dao().FindCollectionByNameOrId("project_files")
	if err != nil {
		return apis.NewBadRequestError("PDF 文件集合不存在。", err)
	}
	record := models.NewRecord(collection)
	form := forms.NewRecordUpsert(s.app, record)
	if err := form.LoadData(map[string]any{
		"project":           projectID,
		"original_filename": header.Filename,
		"status":            "processing",
		"file_hash":         hash,
		"file_size":         header.Size,
		"error_code":        "",
		"error_message":     "",
	}); err != nil {
		return apis.NewBadRequestError("无法创建 PDF 处理记录。", err)
	}
	file, err := filesystem.NewFileFromMultipart(header)
	if err != nil {
		return apis.NewBadRequestError("无法读取上传的 PDF 文件。", err)
	}
	if err := form.AddFiles("file", file); err != nil {
		return apis.NewBadRequestError("无法保存上传的 PDF 文件。", err)
	}
	if err := form.Submit(); err != nil {
		return apis.NewBadRequestError("上传 PDF 失败。", err)
	}

	s.enqueue(importWork{kind: "pdf", id: record.Id})
	return c.JSON(http.StatusAccepted, record)
}

func validateUploadHeader(header *multipart.FileHeader, extension string, maxBytes int64) error {
	if header == nil || header.Size <= 0 {
		return errors.New("上传文件为空。")
	}
	if header.Size > maxBytes {
		return fmt.Errorf("文件超过 %d MB 上限。", maxBytes/(1024*1024))
	}
	if !strings.EqualFold(filepath.Ext(header.Filename), extension) {
		return fmt.Errorf("文件扩展名必须为 %s。", extension)
	}
	return nil
}

func hashMultipartFile(header *multipart.FileHeader) (string, error) {
	file, err := header.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func multipartHasPrefix(header *multipart.FileHeader, expected []byte) (bool, error) {
	file, err := header.Open()
	if err != nil {
		return false, err
	}
	defer file.Close()

	actual := make([]byte, len(expected))
	if _, err := io.ReadFull(file, actual); err != nil {
		return false, nil
	}
	return string(actual) == string(expected), nil
}

func (s *importService) enqueue(work importWork) {
	key := work.kind + ":" + work.id
	s.mu.Lock()
	if _, exists := s.pending[key]; exists {
		s.mu.Unlock()
		return
	}
	s.pending[key] = struct{}{}
	s.mu.Unlock()
	s.queue <- work
}

func (s *importService) finishWork(work importWork) {
	s.mu.Lock()
	delete(s.pending, work.kind+":"+work.id)
	s.mu.Unlock()
}

func (s *importService) runWorker() {
	for work := range s.queue {
		func() {
			defer s.finishWork(work)
			defer func() {
				if recovered := recover(); recovered != nil {
					log.Printf("upload worker panic for %s:%s: %v", work.kind, work.id, recovered)
					s.markFatal(work, "WORKER_PANIC", "服务器处理文件时发生内部错误。")
				}
			}()
			switch work.kind {
			case "csv":
				s.processCSV(work.id)
			case "pdf":
				s.processPDF(work.id)
			}
		}()
	}
}

func (s *importService) recoverPendingWork() {
	jobs, err := s.app.Dao().FindRecordsByFilter(
		"import_jobs",
		`status = "queued" || status = "processing"`,
		"created",
		10000,
		0,
	)
	if err == nil {
		for _, job := range jobs {
			s.enqueue(importWork{kind: "csv", id: job.Id})
		}
	}

	files, err := s.app.Dao().FindRecordsByFilter(
		"project_files",
		`status = "processing"`,
		"created",
		10000,
		0,
	)
	if err == nil {
		for _, file := range files {
			s.enqueue(importWork{kind: "pdf", id: file.Id})
		}
	}
}

func (s *importService) markFatal(work importWork, code, message string) {
	collection := "import_jobs"
	if work.kind == "pdf" {
		collection = "project_files"
	}
	record, err := s.app.Dao().FindRecordById(collection, work.id)
	if err != nil {
		return
	}
	record.Set("status", "failed")
	if work.kind == "pdf" {
		record.Set("status", "error")
	}
	record.Set("error_code", code)
	record.Set("error_message", message)
	if work.kind == "csv" {
		record.Set("finished_at", types.NowDateTime())
	}
	_ = s.app.Dao().SaveRecord(record)
}

func (s *importService) processPDF(recordID string) {
	record, err := s.app.Dao().FindRecordById("project_files", recordID)
	if err != nil {
		return
	}
	reader, closeFile, err := s.openRecordFile(record, "file")
	if err != nil {
		s.markFatal(importWork{kind: "pdf", id: recordID}, "PDF_FILE_MISSING", "服务器找不到已上传的 PDF 文件。")
		return
	}
	defer closeFile()

	header := make([]byte, 5)
	if _, err := io.ReadFull(reader, header); err != nil || string(header) != "%PDF-" {
		s.markFatal(importWork{kind: "pdf", id: recordID}, "INVALID_PDF_SIGNATURE", "文件内容不是有效的 PDF。")
		return
	}

	record.Set("status", "ready")
	record.Set("error_code", "")
	record.Set("error_message", "")
	if err := s.app.Dao().SaveRecord(record); err != nil {
		s.markFatal(importWork{kind: "pdf", id: recordID}, "PDF_STATUS_UPDATE_FAILED", "PDF 已保存，但状态更新失败。")
	}
}

func (s *importService) openRecordFile(record *models.Record, field string) (io.ReadSeeker, func(), error) {
	filename := record.GetString(field)
	if filename == "" {
		return nil, func() {}, errors.New("missing file field")
	}
	fs, err := s.app.NewFilesystem()
	if err != nil {
		return nil, func() {}, err
	}
	reader, err := fs.GetFile(path.Join(record.BaseFilesPath(), filename))
	if err != nil {
		fs.Close()
		return nil, func() {}, err
	}
	closeFn := func() {
		reader.Close()
		fs.Close()
	}
	return reader, closeFn, nil
}

type csvPage struct {
	line      int
	pdfPage   int
	rowJSON   string
	entryText string
}

type csvCounters struct {
	total     int
	processed int
	success   int
	failed    int
}

func (s *importService) processCSV(jobID string) {
	job, err := s.app.Dao().FindRecordById("import_jobs", jobID)
	if err != nil {
		return
	}
	job.Set("status", "processing")
	job.Set("started_at", types.NowDateTime())
	job.Set("finished_at", "")
	job.Set("error_code", "")
	job.Set("error_message", "")
	job.Set("total_count", 0)
	job.Set("processed_count", 0)
	job.Set("success_count", 0)
	job.Set("failed_count", 0)
	if err := s.app.Dao().SaveRecord(job); err != nil {
		return
	}
	if err := s.clearJobArtifacts(jobID); err != nil {
		s.markFatal(
			importWork{kind: "csv", id: jobID},
			"JOB_RECOVERY_CLEANUP_FAILED",
			"无法清理该作业上次未完成的导入结果。",
		)
		return
	}

	file, closeFile, err := s.openRecordFile(job, "source_file")
	if err != nil {
		s.markFatal(importWork{kind: "csv", id: jobID}, "CSV_FILE_MISSING", "服务器找不到已上传的 CSV 文件。")
		return
	}
	defer closeFile()

	decoded, encodingName, err := decodedCSVReader(file)
	if err != nil {
		s.markFatal(importWork{kind: "csv", id: jobID}, "CSV_ENCODING_ERROR", "CSV 编码无法识别，请使用 UTF-8 或 GB18030。")
		return
	}

	csvReader := csv.NewReader(decoded)
	csvReader.FieldsPerRecord = -1
	csvReader.ReuseRecord = false

	headers, err := csvReader.Read()
	if err != nil {
		s.markFatal(importWork{kind: "csv", id: jobID}, "CSV_HEADER_INVALID", csvReadErrorMessage(err))
		return
	}
	headers, pdfIndex, headerErr := validateCSVHeaders(headers)
	if headerErr != nil {
		s.markFatal(importWork{kind: "csv", id: jobID}, "CSV_HEADER_INVALID", headerErr.Error())
		return
	}

	nextPageNumber := s.nextProjectPageNumber(job.GetString("project"))
	counters := &csvCounters{}
	batch := make([]csvPage, 0, batchSize)

	for {
		values, readErr := csvReader.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			line := csvErrorLine(readErr)
			counters.total++
			counters.processed++
			counters.failed++
			s.addJobError(jobID, line, "", "CSV_PARSE_ERROR", csvReadErrorMessage(readErr), "", false)
			continue
		}

		line, _ := csvReader.FieldPos(0)
		counters.total++
		page, validationErr := buildCSVPage(headers, values, pdfIndex, line)
		if validationErr != nil {
			counters.processed++
			counters.failed++
			s.addJobError(
				jobID,
				validationErr.line,
				validationErr.column,
				validationErr.code,
				validationErr.message,
				validationErr.rawValue,
				false,
			)
			continue
		}
		batch = append(batch, page)

		if len(batch) >= batchSize {
			nextPageNumber = s.flushCSVBatch(job, batch, nextPageNumber, counters)
			batch = batch[:0]
			s.updateJobProgress(job, counters, encodingName)
		}
	}

	if len(batch) > 0 {
		nextPageNumber = s.flushCSVBatch(job, batch, nextPageNumber, counters)
		_ = nextPageNumber
	}

	status := "completed"
	if counters.failed > 0 {
		status = "completed_with_errors"
	}
	job.Set("status", status)
	job.Set("total_count", counters.total)
	job.Set("processed_count", counters.processed)
	job.Set("success_count", counters.success)
	job.Set("failed_count", counters.failed)
	job.Set("error_code", "")
	job.Set("error_message", fmt.Sprintf("检测编码：%s", encodingName))
	job.Set("finished_at", types.NowDateTime())
	if err := s.app.Dao().SaveRecord(job); err != nil {
		s.markFatal(importWork{kind: "csv", id: jobID}, "JOB_FINALIZE_FAILED", "条目已处理，但作业状态更新失败。")
	}
}

func (s *importService) clearJobArtifacts(jobID string) error {
	pagesToDelete, err := s.app.Dao().FindRecordsByFilter(
		"pages",
		fmt.Sprintf("import_job = %q", jobID),
		"",
		100000,
		0,
	)
	if err != nil {
		return err
	}
	errorsToDelete, err := s.app.Dao().FindRecordsByFilter(
		"import_job_errors",
		fmt.Sprintf("job = %q", jobID),
		"",
		100000,
		0,
	)
	if err != nil {
		return err
	}
	return s.app.Dao().RunInTransaction(func(txDao *daos.Dao) error {
		for _, page := range pagesToDelete {
			if err := txDao.DeleteRecord(page); err != nil {
				return err
			}
		}
		for _, item := range errorsToDelete {
			if err := txDao.DeleteRecord(item); err != nil {
				return err
			}
		}
		return nil
	})
}

func decodedCSVReader(reader io.ReadSeeker) (io.Reader, string, error) {
	isUTF8, hasBOM, err := inspectUTF8(reader)
	if err != nil {
		return nil, "", err
	}
	if _, err := reader.Seek(0, io.SeekStart); err != nil {
		return nil, "", err
	}
	if isUTF8 {
		if hasBOM {
			if _, err := reader.Seek(3, io.SeekStart); err != nil {
				return nil, "", err
			}
		}
		return reader, "UTF-8", nil
	}
	return transform.NewReader(reader, simplifiedchinese.GB18030.NewDecoder()), "GB18030", nil
}

func inspectUTF8(reader io.Reader) (valid bool, bom bool, err error) {
	buffer := make([]byte, 64*1024)
	pending := make([]byte, 0, utf8.UTFMax)
	first := true

	for {
		n, readErr := reader.Read(buffer)
		if n > 0 {
			data := make([]byte, 0, len(pending)+n)
			data = append(data, pending...)
			data = append(data, buffer[:n]...)
			pending = pending[:0]

			if first {
				first = false
				bom = len(data) >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf
				if bom {
					data = data[3:]
				}
			}

			for len(data) > 0 {
				if !utf8.FullRune(data) {
					pending = append(pending, data...)
					break
				}
				r, size := utf8.DecodeRune(data)
				if r == utf8.RuneError && size == 1 {
					return false, bom, nil
				}
				data = data[size:]
			}
		}
		if errors.Is(readErr, io.EOF) {
			return len(pending) == 0, bom, nil
		}
		if readErr != nil {
			return false, bom, readErr
		}
	}
}

func validateCSVHeaders(raw []string) ([]string, int, error) {
	if len(raw) == 0 {
		return nil, -1, errors.New("CSV 缺少表头。")
	}
	headers := make([]string, len(raw))
	seen := map[string]struct{}{}
	pdfIndex := -1
	for i, value := range raw {
		header := strings.TrimSpace(strings.TrimPrefix(value, "\ufeff"))
		if header == "" {
			return nil, -1, fmt.Errorf("第 %d 列表头为空。", i+1)
		}
		if _, exists := seen[header]; exists {
			return nil, -1, fmt.Errorf("表头 %q 重复。", header)
		}
		seen[header] = struct{}{}
		headers[i] = header
		if header == "PDF页码" {
			pdfIndex = i
		}
	}
	if pdfIndex < 0 {
		return nil, -1, errors.New("CSV 缺少必填字段：PDF页码。")
	}
	return headers, pdfIndex, nil
}

type rowValidationError struct {
	line     int
	column   string
	code     string
	message  string
	rawValue string
}

func buildCSVPage(headers, values []string, pdfIndex, line int) (csvPage, *rowValidationError) {
	if len(values) != len(headers) {
		return csvPage{}, &rowValidationError{
			line:    line,
			code:    "COLUMN_COUNT_MISMATCH",
			message: fmt.Sprintf("本行有 %d 列，表头有 %d 列。", len(values), len(headers)),
		}
	}

	rawPDFPage := strings.TrimSpace(values[pdfIndex])
	pdfPage, err := strconv.Atoi(rawPDFPage)
	if err != nil || pdfPage <= 0 {
		return csvPage{}, &rowValidationError{
			line:     line,
			column:   "PDF页码",
			code:     "INVALID_PDF_PAGE",
			message:  "PDF页码必须是正整数。",
			rawValue: truncateText(rawPDFPage, 200),
		}
	}

	structured := make(map[string]string, len(headers)-1)
	parts := make([]string, 0, len(headers)-1)
	for index, header := range headers {
		if index == pdfIndex {
			continue
		}
		value := strings.TrimSpace(values[index])
		structured[header] = value
		if value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) == 0 {
		return csvPage{}, &rowValidationError{
			line:    line,
			code:    "EMPTY_CONTENT",
			message: "去掉 PDF页码 后内容不能为空。",
		}
	}

	rowJSON, err := json.Marshal(structured)
	if err != nil {
		return csvPage{}, &rowValidationError{
			line:    line,
			code:    "ROW_SERIALIZE_ERROR",
			message: "无法序列化本行内容。",
		}
	}
	return csvPage{
		line:      line,
		pdfPage:   pdfPage,
		rowJSON:   string(rowJSON),
		entryText: strings.Join(parts, " "),
	}, nil
}

func (s *importService) nextProjectPageNumber(projectID string) int {
	records, err := s.app.Dao().FindRecordsByFilter(
		"pages",
		fmt.Sprintf("project = %q", projectID),
		"-page_number",
		1,
		0,
	)
	if err != nil || len(records) == 0 {
		return 1
	}
	return records[0].GetInt("page_number") + 1
}

func (s *importService) flushCSVBatch(
	job *models.Record,
	rows []csvPage,
	nextPageNumber int,
	counters *csvCounters,
) int {
	projectID := job.GetString("project")
	err := s.app.Dao().RunInTransaction(func(txDao *daos.Dao) error {
		for index, row := range rows {
			if err := savePage(txDao, job.Id, projectID, nextPageNumber+index, row); err != nil {
				return err
			}
		}
		return nil
	})
	if err == nil {
		counters.processed += len(rows)
		counters.success += len(rows)
		return nextPageNumber + len(rows)
	}

	// Fall back to individual writes so one unexpected database error doesn't
	// prevent later valid rows from importing.
	for _, row := range rows {
		if err := savePage(s.app.Dao(), job.Id, projectID, nextPageNumber, row); err != nil {
			counters.failed++
			s.addJobError(
				job.Id,
				row.line,
				"",
				"DATABASE_WRITE_ERROR",
				"该行通过格式校验，但写入数据库失败。",
				truncateText(err.Error(), 500),
				true,
			)
		} else {
			counters.success++
			nextPageNumber++
		}
		counters.processed++
	}
	return nextPageNumber
}

func savePage(dao *daos.Dao, jobID, projectID string, pageNumber int, row csvPage) error {
	collection, err := dao.FindCollectionByNameOrId("pages")
	if err != nil {
		return err
	}
	record := models.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("import_job", jobID)
	record.Set("page_number", pageNumber)
	record.Set("pdf_page", row.pdfPage)
	record.Set("ocr_row_json", row.rowJSON)
	record.Set("ocr_text", row.entryText)
	record.Set("proofread_round", 1)
	record.Set("mismatch_count", 0)
	record.Set("status", "pending")
	return dao.SaveRecord(record)
}

func (s *importService) addJobError(
	jobID string,
	rowNumber int,
	columnName string,
	code string,
	message string,
	rawValue string,
	retryable bool,
) {
	collection, err := s.app.Dao().FindCollectionByNameOrId("import_job_errors")
	if err != nil {
		return
	}
	record := models.NewRecord(collection)
	record.Set("job", jobID)
	record.Set("row_number", rowNumber)
	record.Set("column_name", columnName)
	record.Set("error_code", code)
	record.Set("message", message)
	record.Set("raw_value", truncateText(rawValue, 1000))
	record.Set("retryable", retryable)
	if err := s.app.Dao().SaveRecord(record); err != nil {
		log.Printf("failed to persist import error for job %s row %d: %v", jobID, rowNumber, err)
	}
}

func (s *importService) updateJobProgress(job *models.Record, counters *csvCounters, encodingName string) {
	job.Set("processed_count", counters.processed)
	job.Set("success_count", counters.success)
	job.Set("failed_count", counters.failed)
	job.Set("error_message", fmt.Sprintf("检测编码：%s", encodingName))
	_ = s.app.Dao().SaveRecord(job)
}

func csvErrorLine(err error) int {
	var parseError *csv.ParseError
	if errors.As(err, &parseError) {
		return parseError.Line
	}
	return 0
}

func csvReadErrorMessage(err error) string {
	var parseError *csv.ParseError
	if errors.As(err, &parseError) {
		return fmt.Sprintf("第 %d 行、第 %d 列 CSV 格式错误：%s。", parseError.Line, parseError.Column, parseError.Err)
	}
	return "CSV 格式错误。"
}

func truncateText(value string, maxRunes int) string {
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes]) + "…"
}
