/// <reference path="../pb_data/types.d.ts" />

// Migration:
// Add structured CSV payload fields for pages to support table-like editing/review UI.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  const hasOcrJson = !!pages.schema.getFieldByName("ocr_row_json")
  if (!hasOcrJson) {
    pages.schema.addField(new SchemaField({
      name: "ocr_row_json",
      type: "text",
      required: false,
      options: { min: null, max: null, pattern: "" }
    }))
  }

  const hasProofreadJson = !!pages.schema.getFieldByName("proofread_row_json")
  if (!hasProofreadJson) {
    pages.schema.addField(new SchemaField({
      name: "proofread_row_json",
      type: "text",
      required: false,
      options: { min: null, max: null, pattern: "" }
    }))
  }

  dao.saveCollection(pages)

  // Backfill legacy records to keep compatibility.
  const allPages = dao.findRecordsByFilter("pages", "id != \"\"", "created", 1000000, 0)
  for (const r of allPages) {
    const ocrJson = r.getString("ocr_row_json")
    const proofreadJson = r.getString("proofread_row_json")
    const ocrText = r.getString("ocr_text")
    const proofreadText = r.getString("proofread_text")

    if (!ocrJson && ocrText) {
      r.set("ocr_row_json", JSON.stringify({ "内容": ocrText }))
    }
    if (!proofreadJson && proofreadText) {
      r.set("proofread_row_json", JSON.stringify({ "内容": proofreadText }))
    }
    dao.saveRecord(r)
  }
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")

  try {
    const f = pages.schema.getFieldByName("ocr_row_json")
    if (f) pages.schema.removeField(f.id)
  } catch {}

  try {
    const f = pages.schema.getFieldByName("proofread_row_json")
    if (f) pages.schema.removeField(f.id)
  } catch {}

  dao.saveCollection(pages)
})
