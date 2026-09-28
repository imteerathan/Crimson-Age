### Atlas loader foundation

The Horizon loader boundary is intentionally host-agnostic until the real Atlas loader contract is verified. The current implementation accepts only a small versioned host descriptor and capability list, then produces a normalized Horizon session state.

No Atlas internal IPC, socket, filesystem path, or private host API is assumed.

Current test contract:

- host absent -> clean standalone fallback;
- matching protocol -> extension loads;
- capability mismatch -> negotiated subset + local fallback;
- incompatible protocol -> fail closed;
- host-specific APIs remain outside renderer modules.

The first production Atlas integration task is therefore contract substitution, not renderer rewrites: replace the temporary loader input with the verified Atlas Host Extension API while preserving the normalized Horizon state.
