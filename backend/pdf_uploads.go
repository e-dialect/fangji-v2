package main

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const pdfChunkBytes int64 = 1024 * 1024
const pdfUploadTTL = time.Hour
const pdfStagingBudget int64 = 1024 * 1024 * 1024

type pdfUploadSession struct {
	id, owner, project, name, dir, recordID string
	size                                    int64
	touched                                 time.Time
	hashes                                  map[int][32]byte
	canceled, released                      bool
}
type pdfUploadPool struct {
	mu       sync.Mutex
	root     string
	sessions map[string]*pdfUploadSession
}

func (s *importService) registerChunkUploads() {
	pool := &pdfUploadPool{sessions: map[string]*pdfUploadSession{}}
	stop := make(chan struct{})
	s.app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error { close(stop); return e.Next() })
	s.app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		pool.root = filepath.Join(s.app.DataDir(), "pdf-upload-staging-v1")
		// Sessions intentionally do not survive a process restart.
		if err := os.RemoveAll(pool.root); err != nil {
			return err
		}
		if err := os.MkdirAll(pool.root, 0700); err != nil {
			return err
		}
		base := "/api/fangji/projects/{projectId}/pdf-uploads"
		e.Router.POST(base, func(c *core.RequestEvent) error { return s.createPDFUpload(c, pool) }).Bind(apis.RequireAuth("users"), apis.BodyLimit(4096))
		e.Router.PUT(base+"/{uploadId}/chunks/{index}", func(c *core.RequestEvent) error { return s.putPDFChunk(c, pool) }).Bind(apis.RequireAuth("users"), apis.BodyLimit(pdfChunkBytes))
		e.Router.POST(base+"/{uploadId}/complete", func(c *core.RequestEvent) error { return s.completePDFUpload(c, pool) }).Bind(apis.RequireAuth("users"), apis.BodyLimit(4096))
		e.Router.DELETE(base+"/{uploadId}", func(c *core.RequestEvent) error { return s.cancelPDFUpload(c, pool) }).Bind(apis.RequireAuth("users"))
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-stop:
					return
				case now := <-ticker.C:
					pool.mu.Lock()
					pool.cleanup(now)
					pool.mu.Unlock()
				}
			}
		}()
		return e.Next()
	})
}
func (p *pdfUploadPool) cleanup(now time.Time) {
	for id, u := range p.sessions {
		if !u.touched.Add(pdfUploadTTL).After(now) {
			if os.RemoveAll(u.dir) == nil {
				delete(p.sessions, id)
			}
		}
	}
}
func (s *importService) authorizePDFUpload(c *core.RequestEvent) error {
	if c.Auth == nil || c.Auth.GetBool("must_change_password") {
		return apis.NewForbiddenError("请先登录并完成初始密码修改。", nil)
	}
	_, _, err := s.requireProjectManager(c, c.Request.PathValue("projectId"))
	return err
}
func (p *pdfUploadPool) session(c *core.RequestEvent) (*pdfUploadSession, error) {
	u := p.sessions[c.Request.PathValue("uploadId")]
	if u == nil || u.owner != c.Auth.Id || u.project != c.Request.PathValue("projectId") {
		return nil, apis.NewNotFoundError("上传会话不存在，请重新选择文件上传。", nil)
	}
	if !u.touched.Add(pdfUploadTTL).After(time.Now()) {
		return nil, apis.NewApiError(http.StatusGone, "上传已过期，请重新上传。", nil)
	}
	if u.canceled {
		return nil, apis.NewApiError(http.StatusGone, "上传已取消。", nil)
	}
	return u, nil
}
func (s *importService) createPDFUpload(c *core.RequestEvent, p *pdfUploadPool) error {
	if err := s.authorizePDFUpload(c); err != nil {
		return err
	}
	var body struct {
		Name      string `json:"name"`
		Size      int64  `json:"size"`
		RequestID string `json:"requestId"`
	}
	if err := c.BindBody(&body); err != nil {
		return apis.NewBadRequestError("上传参数无效。", nil)
	}
	if body.Size <= 0 || body.Size > maxPDFBytes || len(body.Name) > 255 || !strings.EqualFold(filepath.Ext(body.Name), ".pdf") || len(body.RequestID) < 16 || len(body.RequestID) > 80 {
		return apis.NewBadRequestError("请选择不超过 100 MiB 的 PDF 文件。", nil)
	}
	// A client-generated key makes a lost session-creation response retryable.
	id := fmt.Sprintf("%x", sha256.Sum256([]byte(c.Auth.Id+"\x00"+body.RequestID)))
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cleanup(time.Now())
	if u := p.sessions[id]; u != nil {
		if u.project != c.Request.PathValue("projectId") || u.name != body.Name || u.size != body.Size || u.canceled {
			return apis.NewApiError(409, "上传会话参数冲突。", nil)
		}
		u.touched = time.Now()
		return c.JSON(200, map[string]any{"id": id, "chunkSize": pdfChunkBytes})
	}
	active := 0
	var reserved int64
	for _, u := range p.sessions {
		if !u.released {
			reserved += 2 * u.size
		}
		if u.recordID != "" || u.canceled {
			continue
		}
		if u.owner == c.Auth.Id {
			return apis.NewApiError(429, "已有上传进行中，请取消或完成后再试。", nil)
		}
		active++
	}
	if active >= 4 || reserved+2*body.Size > pdfStagingBudget {
		return apis.NewApiError(429, "上传服务繁忙，请稍后重试。", nil)
	}
	// Bound retained idempotency entries as well as active disk reservations.
	if len(p.sessions) >= 1024 {
		return apis.NewApiError(429, "上传会话过多，请稍后重试。", nil)
	}
	dir := filepath.Join(p.root, id)
	if err := os.Mkdir(dir, 0700); err != nil {
		return apis.NewApiError(500, "无法准备上传空间。", nil)
	}
	p.sessions[id] = &pdfUploadSession{id: id, owner: c.Auth.Id, project: c.Request.PathValue("projectId"), name: body.Name, size: body.Size, dir: dir, touched: time.Now(), hashes: map[int][32]byte{}}
	return c.JSON(201, map[string]any{"id": id, "chunkSize": pdfChunkBytes})
}
func (s *importService) putPDFChunk(c *core.RequestEvent, p *pdfUploadPool) error {
	if err := s.authorizePDFUpload(c); err != nil {
		return err
	}
	// Read at most one small chunk before the short serialized disk mutation.
	data, err := io.ReadAll(io.LimitReader(c.Request.Body, pdfChunkBytes+1))
	if err != nil {
		return apis.NewBadRequestError("读取分片失败。", nil)
	}
	index, err := strconv.Atoi(c.Request.PathValue("index"))
	if err != nil || index < 0 || len(data) == 0 || int64(len(data)) > pdfChunkBytes {
		return apis.NewBadRequestError("分片无效。", nil)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	u, err := p.session(c)
	if err != nil {
		return err
	}
	if int64(index) >= (u.size+pdfChunkBytes-1)/pdfChunkBytes {
		return apis.NewBadRequestError("分片编号无效。", nil)
	}
	expected := min(pdfChunkBytes, u.size-int64(index)*pdfChunkBytes)
	if int64(len(data)) != expected {
		return apis.NewBadRequestError("分片长度不符。", nil)
	}
	hash := sha256.Sum256(data)
	if previous, ok := u.hashes[index]; ok {
		if previous != hash {
			return apis.NewApiError(409, "重复分片内容不一致。", nil)
		}
		u.touched = time.Now()
		return c.NoContent(204)
	}
	if u.recordID != "" {
		return apis.NewApiError(409, "上传已完成。", nil)
	}
	name := filepath.Join(u.dir, fmt.Sprintf("%d.part", index))
	if err := os.WriteFile(name, data, 0600); err != nil {
		_ = os.Remove(name)
		return apis.NewApiError(500, "保存分片失败。", nil)
	}
	u.hashes[index] = hash
	u.touched = time.Now()
	return c.NoContent(204)
}
func (s *importService) completePDFUpload(c *core.RequestEvent, p *pdfUploadPool) error {
	if err := s.authorizePDFUpload(c); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	u, err := p.session(c)
	if err != nil {
		return err
	}
	if u.recordID != "" {
		record, err := s.app.FindRecordById("project_files", u.recordID)
		if err != nil {
			return apis.NewNotFoundError("已上传文件不存在。", nil)
		}
		u.touched = time.Now()
		return c.JSON(200, record)
	}
	if len(u.hashes) != int((u.size+pdfChunkBytes-1)/pdfChunkBytes) {
		return apis.NewApiError(409, "分片尚未上传完整。", nil)
	}
	assembled := filepath.Join(u.dir, "assembled.pdf")
	hash, err := assemblePDFUpload(u, assembled)
	if err != nil {
		_ = os.Remove(assembled)
		return apis.NewBadRequestError("分片校验或合并失败，请重新上传。", nil)
	}
	defer os.Remove(assembled)
	file, err := filesystem.NewFileFromPath(assembled)
	if err != nil {
		return apis.NewApiError(500, "读取合并文件失败。", nil)
	}
	record, err := s.saveUploadedPDF(u.project, u.name, u.size, hash, file)
	if err != nil {
		return err
	}
	// Preserve the result before responding so a lost response never creates a second record.
	u.recordID = record.Id
	u.touched = time.Now()
	u.released = os.RemoveAll(u.dir) == nil
	return c.JSON(202, record)
}
func assemblePDFUpload(u *pdfUploadSession, dest string) (string, error) {
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	defer out.Close()
	full := sha256.New()
	var total int64
	for i := 0; i < len(u.hashes); i++ {
		data, err := os.ReadFile(filepath.Join(u.dir, fmt.Sprintf("%d.part", i)))
		if err != nil {
			return "", err
		}
		if sha256.Sum256(data) != u.hashes[i] {
			return "", errors.New("chunk hash mismatch")
		}
		if i == 0 && !strings.HasPrefix(string(data), "%PDF-") {
			return "", errors.New("not a PDF")
		}
		n, err := io.MultiWriter(out, full).Write(data)
		total += int64(n)
		if err != nil {
			return "", err
		}
	}
	if total != u.size {
		return "", errors.New("length mismatch")
	}
	if err := out.Close(); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", full.Sum(nil)), nil
}
func (s *importService) cancelPDFUpload(c *core.RequestEvent, p *pdfUploadPool) error {
	if err := s.authorizePDFUpload(c); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	u := p.sessions[c.Request.PathValue("uploadId")]
	if u == nil || u.owner != c.Auth.Id || u.project != c.Request.PathValue("projectId") {
		return apis.NewNotFoundError("上传会话不存在。", nil)
	}
	if err := os.RemoveAll(u.dir); err != nil {
		return apis.NewApiError(500, "清理上传失败，请重试。", nil)
	}
	u.released = true
	if u.recordID == "" {
		u.canceled = true
	}
	u.touched = time.Now()
	return c.NoContent(204)
}
func (s *importService) saveUploadedPDF(projectID, name string, size int64, hash string, file *filesystem.File) (*core.Record, error) {
	collection, err := s.app.FindCollectionByNameOrId("project_files")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	form := forms.NewRecordUpsert(s.app, record)
	form.Load(map[string]any{"project": projectID, "original_filename": name, "status": "processing", "file_hash": hash, "file_size": size, "error_code": "", "error_message": ""})
	record.Set("file", file)
	if err := form.Submit(); err != nil {
		return nil, apis.NewBadRequestError("保存 PDF 失败。", err)
	}
	s.enqueue(importWork{kind: "pdf", id: record.Id, requestID: newRequestID()})
	return record, nil
}
