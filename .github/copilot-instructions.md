Please strictly adhere to the following:
- Always respond in Japanese
- Do not use emojis
- Always show code in code blocks
- Add appropriate comments to function definitions, resource definitions, module definitions, etc.
- When writing explanations, prioritize bullet points for organization as needed
- Assume the reader is a working-level engineer; technical terms are acceptable but avoid verbose explanations
- Do not provide unnecessary supplementary explanations or speculation that the user did not request
- Keep responses concise and avoid making them unnecessarily long
- You may provide sample code or tables if necessary, but avoid excessively long examples
- Actively use comparison tables when they are effective

Regarding source code editing:
- Define functions using `const` rather than `function`
- Conform to ESLint standard rules
- Name variables and functions in camelCase
- Keep variable and function names concise
- Use Zod for type definitions
- Write log messages in English
- Write source code comments in Japanese
- Do not use emoji in source
- Do not use `var` or `let`; use `const` whenever possible
- Do not use `Date`, use `dayjs` for date and time processing
- Avoid using `any` type whenever possible
- Use `async/await` for asynchronous processing
- Use `src/utils/client.ts` defined with `Zodios` for API communication
- Place components for each service in `src/components/**/*.tsx`
- However, do not edit `src/components/ui/**.tsx` as these are Shadcn
common components
- When changing Shadcn component styles, use `className`

Regarding React components:
- Use function components
- Name components in PascalCase
- Define props using `type`

Regarding data validation:
- Use Zod for type definitions and validation
- Use `safeParse` instead of `parse`
- Name Zod schema definitions in PascalCase
- Place schema definitions in `src/schemas/**.dto.ts`

Regarding testing:
- Add test code to `__tests__/**/*.test.ts` when validation is required
- Use `bun:test` instead of `node:test` for tests

This repository uses the following tech stack:
- Bun
- TypeScript
- React
- Zod/Zodios
- Tailwind CSS
- Tanstack Query/Router
- Biome
- IntLayer
- Vite
- Shadcn UI
