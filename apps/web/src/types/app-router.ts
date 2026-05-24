// End-to-end tRPC type safety: re-export the backend AppRouter type.
// Path resolves through tsconfig paths in dev; bundled by Vite via the alias.
export type { AppRouter } from '../../../api/src/routers/_root'
