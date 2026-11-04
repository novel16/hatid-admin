<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local runtime

- Active application path: C:/Users/Novel/Desktop/laravel projects/hatid/admin. Use native Windows Node24 from this copy. The previous WSL copy is no longer the active source. The copied node_modules contains Linux binaries and needs a Windows install from package-lock.json before app startup; no Windows Next launcher/bindings were present during the3 November review.
- Local port is 3012 for both npm run dev and npm run start; the sibling rider frontend uses 3011. Keep API CORS/client URLs aligned with these ports.
- Before handing server startup back to the user, stop any task-owned preview occupying this app's port and verify the port is free. Leave user-owned or unrelated processes untouched. Only one dev/start process can listen on this app's port at a time.

## Required skills, simplicity and comments

- Always use the installed Ponytail skill for every feature and other coding change, including fixes and refactors. Follow its workflow before implementation.
- Use the relevant Superpowers skills when needed, such as for planning, debugging, testing or verification. Keep the workflow proportionate to the task and within the user's authorized scope.
- Avoid over-engineering and over-architecture. Add abstractions, layers, dependencies or files only for a demonstrated requirement or meaningful reuse; do not build speculative flexibility.
- Prefer clear names, straightforward control flow, guard clauses and small cohesive functions. Avoid deep nesting, clever shortcuts or complex generic code when a simple, readable implementation works. Do not sacrifice readability just to shorten code.
- Reuse existing helpers/components and native or framework features before introducing custom solutions. Preserve validation, authorization, security, accessibility, data integrity and meaningful tests when simplifying.
- Add a brief purpose comment or docblock before every function and method, including small helpers and callbacks. Use the language's usual style, including PHPDoc for PHP. Explain intent or the business rule, keep comments accurate, and avoid narrating each line of code.
- Apply the comment rule to every new or modified function/method. Do not perform a broad comment-only rewrite of untouched code unless the user requests it.

## Reusable React components

- Extract repeated UI or interaction patterns into shared components and reuse them across pages. Check existing components first. The preference for fewer files must not lead to copied UI or prevent useful component reuse.
- Use one shared Modal shell within this app for common dialog layout, opening/closing, backdrop and keyboard/focus accessibility. Compose each page's title, content and actions through simple props and children; reuse that shell in feature-specific dialogs.
- Keep feature-specific form content, state, validation and submission behaviour with the feature, composed inside shared UI. Extract repeated logic into small helpers or hooks when there is real reuse.
- Keep component APIs focused and readable. Add only variants required by actual screens; avoid a universal component with many unrelated flags or business rules.

## Device resource limits

- The user's device has 8 GB RAM and an 11th-generation Intel Core i5. Run tests, builds and page compilation sequentially, with only one heavy operation active at a time. Never launch multiple suites/builds/compilers together.
- Keep checks focused on the change, and do not repeat passing suites without a new reason. Start the Next.js apps one at a time; reuse an existing valid production build for previews when possible.
- If a task-owned process stalls, stop it safely before trying another heavy operation. Preserve unrelated processes and follow the project runtime rules for any WSL/Docker recovery.
