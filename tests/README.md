# Integration Tests

This directory contains integration tests that run the compiled Sweepy CLI against copies of the real `reference/` project. Unit tests belong next to their source.

Expected rewrite results live under `fixtures/<command>/<invocation>/`. Each fixture contains only files affected by that invocation and is compared byte-for-byte with the rewritten temporary project.
