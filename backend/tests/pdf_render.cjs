// Local-only PDF.js render comparison. No HTTP server or remote requests.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const output = path.resolve(process.argv[2])
const assets = path.resolve(__dirname, '../../frontend/public/pdfjs')
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')))

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      assert.equal(url.origin, 'http://localhost', 'Unexpected network request')
      if (url.pathname.startsWith('/pdfjs/')) {
        const file = path.resolve(assets, '.' + url.pathname.slice('/pdfjs'.length))
        assert(file.startsWith(assets + path.sep))
        return route.fulfill({ path: file })
      }
      return route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' })
    })
    await page.goto('http://localhost/')
    await page.addScriptTag({ path: path.join(assets, 'pdf.min.js') })
    await page.evaluate(() => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'
      window.openPDF = async encoded => pdfjsLib.getDocument({
        data: Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0)),
        cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/', isEvalSupported: false,
      }).promise
      window.signature = async (doc, number, hideWatermark = false) => {
        const pg = await doc.getPage(number), viewport = pg.getViewport({ scale: 1 })
        await pg.getOperatorList()
        await document.fonts.ready
        const canvas = document.querySelector('canvas'), context = canvas.getContext('2d', { willReadFrequently: true })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const config = await doc.getOptionalContentConfig()
        const groups = Object.entries(config.getGroups() || {}).filter(([, group]) => group.name === 'Watermark')
        if (hideWatermark) {
          if (groups.length !== 1) throw Error('Expected exactly one watermark layer')
          for (const [id] of groups) config.setVisibility(id, false)
        }
        await pg.render({ canvasContext: context, viewport, optionalContentConfigPromise: Promise.resolve(config) }).promise
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))).map(n => n.toString(16).padStart(2, '0')).join('')
        const text = (await pg.getTextContent()).items.filter(i => 'str' in i).map(i => i.str)
        pg.cleanup()
        return { hash, text, width: viewport.width, height: viewport.height, rotation: pg.rotate }
      }
    })
    await page.evaluate(async encoded => { window.source = await openPDF(encoded) }, fs.readFileSync(path.join(output, 'source.pdf')).toString('base64'))
    assert.equal(await page.evaluate(() => source.numPages), manifest.pages)
    const expected = []
    for (let n = 1; n <= manifest.pages; n++) expected.push(await page.evaluate(n => signature(source, n), n))
    if (manifest.synthetic) {
      assert.equal(expected[1].rotation, 90)
      expected.forEach((item, i) => {
        assert(item.text.includes(`SOURCE_PAGE_${i + 1}`))
        assert(item.text.includes('Shared resource'))
      })
    }
    let checkedPages = 0
    for (let start = 1; start <= manifest.pages; start++) {
      await page.evaluate(async encoded => { window.task = await openPDF(encoded) }, fs.readFileSync(path.join(output, `task-${start}.pdf`)).toString('base64'))
      const count = Math.min(2, manifest.pages - start + 1)
      assert.equal(await page.evaluate(() => task.numPages), count)
      for (let local = 1; local <= count; local++) {
        const original = expected[start + local - 2]
        const unmarked = await page.evaluate(n => signature(task, n, true), local)
        const marked = await page.evaluate(n => signature(task, n), local)
        assert.deepEqual([unmarked.width, unmarked.height], [original.width, original.height], `page geometry ${start}/${local}`)
        if (unmarked.hash !== original.hash) {
          await page.evaluate(n => signature(task, n, true), local)
          await page.locator('canvas').screenshot({ path: path.join(output, 'mismatch-task.png') })
          await page.evaluate(n => signature(source, n), start + local - 1)
          await page.locator('canvas').screenshot({ path: path.join(output, 'mismatch-source.png') })
        }
        assert.equal(unmarked.hash, original.hash, `visible source content changed at ${start}/${local}`)
        // Text extraction includes hidden OCGs. Require exactly one added stamp
        // and the original text in order; no other pages may leak into the task.
        assert.equal(marked.text.filter(s => s === manifest.stamp).length, 1, `stamp ${start}/${local}`)
        assert.deepEqual(marked.text.filter(s => s !== manifest.stamp && s.trim()), original.text.filter(s => s.trim()), `text changed at ${start}/${local}`)
        assert.notEqual(marked.hash, unmarked.hash, `watermark invisible at ${start}/${local}`)
        checkedPages++
      }
      await page.evaluate(() => task.destroy())
      if (start % 25 === 0 || start === manifest.pages) console.log(`Rendered ${start}/${manifest.pages} tasks (${checkedPages} pages)`)
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ tasks: manifest.pages, renderedPages: checkedPages, sourcePixelsMatch: true, watermarksVisible: true }, null, 2) + '\n')
    console.log('PASS: source pixels, text, geometry, two-page/EOF boundaries and visible watermarks')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
