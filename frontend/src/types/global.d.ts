/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ADMIN_TOKEN?: string;
  readonly VITE_DEBUG_PAIRING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Error {
  code?: string;
}
