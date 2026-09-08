// Preserve column order separately from JSON objects, including numeric headers.
migrate((db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  pages.schema.addField(new SchemaField({name:"row_headers_json",type:"text",required:false,options:{min:null,max:null,pattern:""}}))
  dao.saveCollection(pages)
  // Existing rows can recover exact order from their retained CSV inspection.
  for (let offset = 0;; offset += 500) {
    const records = dao.findRecordsByFilter("pages", 'id != ""', "id", 500, offset)
    for (const page of records) {
      let row = {}, headers = []
      try { row = JSON.parse(page.getString("ocr_row_json")) || {} } catch {}
      try {
        const job = dao.findRecordById("import_jobs", page.getString("import_job"))
        const inspection = JSON.parse(job.getString("inspection_json"))
        headers = inspection.headers.filter(key => key !== inspection.pdf_page_field && Object.prototype.hasOwnProperty.call(row, key))
      } catch {}
      const ordered = [...new Set([...headers, ...Object.keys(row)])]
      page.set("row_headers_json", JSON.stringify(ordered))
      dao.saveRecord(page)
    }
    if (records.length < 500) break
  }
}, (db) => {
  const dao = new Dao(db)
  const pages = dao.findCollectionByNameOrId("pages")
  const field = pages.schema.getFieldByName("row_headers_json")
  if (field) pages.schema.removeField(field.id)
  dao.saveCollection(pages)
})
