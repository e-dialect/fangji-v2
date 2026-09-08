# Review workspace browser regression

Start Vite on port 5173 with `npm run dev`, then run `node tests/browser/review.cjs`
from the frontend directory with Playwright available (locally or through `NODE_PATH`).
The default browser is installed Chrome; set `BROWSER_CHANNEL` to choose another channel.

The fixture mounts the real proofreading and arbitration views with a memory router.
All API requests are intercepted and answered with synthetic records and an embedded
sample PDF; no backend data is read or written. Checks cover desktop keyboard placement,
mobile character insertion, pinned keyboard, mobile group switching, field navigation and overview. Screenshots
are written to `/tmp/review-*.png` for visual inspection.

Native iOS/Android keyboard behavior still requires device testing; desktop viewport
emulation cannot verify the operating system's keyboard or IME.
