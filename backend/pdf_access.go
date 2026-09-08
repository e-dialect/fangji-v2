package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	pdfapi "github.com/pdfcpu/pdfcpu/pkg/api"
	pdfmodel "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdftypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

func (s *importService) registerPDFPreview() {
	s.app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/api/fangji/pages/:pageId/pdf", s.taskPDF, apis.RequireRecordAuth("users"))
		return nil
	})
	s.app.OnFileDownloadRequest("project_files").Add(func(e *core.FileDownloadEvent) error {
		e.HttpContext.Response().Header().Set("Cache-Control", "private, no-store")
		return nil
	})
}

func (s *importService) taskPDF(c echo.Context) error {
	auth, _ := c.Get(apis.ContextAuthRecordKey).(*models.Record)
	if auth == nil || auth.GetBool("must_change_password") {
		return apis.NewForbiddenError("请先登录并完成初始密码修改。", nil)
	}
	page, err := s.app.Dao().FindRecordById("pages", c.PathParam("pageId"))
	if err != nil {
		return apis.NewNotFoundError("条目不存在。", nil)
	}
	projectID := page.GetString("project")
	if _, _, err := s.requireProjectManager(c, projectID); err != nil {
		members, lookupErr := s.app.Dao().FindRecordsByFilter("project_memberships", fmt.Sprintf(`project = %q && user = %q && role = "proofreader"`, projectID, auth.Id), "", 1, 0)
		if lookupErr != nil || len(members) == 0 || page.GetString("proofreader") != auth.Id || (page.GetString("status") != "claimed" && page.GetString("status") != "proofreading") {
			return apis.NewForbiddenError("只能查看当前分配给你的任务 PDF。", nil)
		}
		leases, err := s.app.Dao().FindRecordsByFilter("task_leases", fmt.Sprintf(`page = %q && holder = %q`, page.Id, auth.Id), "", 1, 0)
		if err != nil || len(leases) == 0 || !leases[0].GetDateTime("expires_at").Time().After(time.Now()) {
			return apis.NewForbiddenError("任务租约已失效，请重新领取。", nil)
		}
	}
	var file *models.Record
	if id := page.GetString("project_file"); id != "" {
		file, err = s.app.Dao().FindRecordById("project_files", id)
	} else {
		files, lookupErr := s.app.Dao().FindRecordsByFilter("project_files", fmt.Sprintf(`project = %q && status = "ready" && is_primary = true`, projectID), "-created", 1, 0)
		err = lookupErr
		if len(files) > 0 {
			file = files[0]
		}
	}
	if err != nil || file == nil || file.GetString("project") != projectID || file.GetString("status") != "ready" {
		return apis.NewNotFoundError("没有可预览的 PDF。", nil)
	}
	start := page.GetInt("pdf_page")
	if start < 1 {
		start = page.GetInt("page_number")
	}
	count := file.GetInt("page_count")
	if start < 1 || start > count {
		return apis.NewBadRequestError("任务 PDF 页码超出文件范围。", nil)
	}
	reader, closeFile, err := s.openRecordFile(file, "file")
	if err != nil {
		return apis.NewNotFoundError("无法读取 PDF。", err)
	}
	defer closeFile()
	end := start + 1
	if end > count {
		end = count
	}
	stamp := fmt.Sprintf("Fangji | %s | %s | %s UTC", auth.Id, page.Id, time.Now().UTC().Format("2006-01-02 15:04:05"))
	output, err := buildTaskPDF(reader, start, end, stamp)
	if err != nil {
		return apis.NewBadRequestError("PDF 分页或水印生成失败，请联系项目管理员。", err)
	}
	c.Response().Header().Set("Cache-Control", "private, no-store")
	c.Response().Header().Set("X-Content-Type-Options", "nosniff")
	c.Response().Header().Set("Content-Disposition", `inline; filename="task-preview.pdf"`)
	// Metadata is also available across separately hosted frontend/backend deployments.
	c.Response().Header().Set("Access-Control-Expose-Headers", "X-PDF-Start-Page, X-PDF-End-Page, X-PDF-Total-Pages")
	c.Response().Header().Set("X-PDF-Start-Page", fmt.Sprint(start))
	c.Response().Header().Set("X-PDF-End-Page", fmt.Sprint(end))
	c.Response().Header().Set("X-PDF-Total-Pages", fmt.Sprint(count))
	return c.Blob(http.StatusOK, "application/pdf", output)
}

func buildTaskPDF(reader io.ReadSeeker, start, end int, stamp string) ([]byte, error) {
	pdfapi.DisableConfigDir()
	config := pdfmodel.NewDefaultConfiguration()
	config.ValidationMode = pdfmodel.ValidationRelaxed
	var excerpt, output bytes.Buffer
	if err := pdfapi.Trim(reader, &excerpt, []string{fmt.Sprintf("%d-%d", start, end)}, config); err != nil {
		return nil, err
	}
	watermark, err := pdfapi.TextWatermark(stamp, "fontname:Helvetica, points:11, scale:1 abs, rotation:25, opacity:0.18", true, false, pdftypes.POINTS)
	if err != nil {
		return nil, err
	}
	if err := pdfapi.AddWatermarks(bytes.NewReader(excerpt.Bytes()), &output, nil, watermark, config); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
