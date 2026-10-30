import { z } from 'zod';

// The production CSP forbids 'unsafe-eval'. Zod 4 would otherwise probe `new Function('')` at schema construction,
// which the browser reports as a securitypolicyviolation (and console error) even though zod catches it.
// jitless keeps the interpreted parser (identical results). Must be the first import of the entry point.
z.config({ jitless: true });
