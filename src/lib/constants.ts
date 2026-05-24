// Phase 1 is single-tenant. All tenant FKs point here. When we add a
// second gym, this constant goes away and gymId comes from session/auth.
export const DEFAULT_GYM_ID = 'dsc_default_gym'
