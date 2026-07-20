// Give the RTK Query base query an absolute base URL so `fetchBaseQuery` can
// build a valid `Request` under jsdom/node (a relative URL throws). Runs before
// the modules under test are imported, so `config.ts` reads it.
process.env['NEXT_PUBLIC_API_BASE_URL'] = 'https://api.test';
