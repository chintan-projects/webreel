---
title: "Mixed Surface Demo"
duration: 45s
viewport: 1920x1080
---

# Introduction (10s)

## Title Card

> surface: title
> subtitle: "Terminal meets visual"

"This demo shows how different surfaces work together."

# Terminal Work (25s)

## Setup Environment

> surface: terminal
> shell: bash
> transition_in: crossfade 300ms

"Let's set up our development environment."

- run: "mkdir -p demo-project"
- run: "cd demo-project && echo '{}' > package.json"
- type_command: "ls -la"

> note: Show file listing with colors

## Run Tests

> surface: terminal

"Now we'll verify everything works."

- run: "echo 'All 42 tests passed in 1.3s'"
  capture:
  test_count: regex("(\\d+) tests")
  duration: regex("in (\\d+\\.\\d+)s")

"[read_output:test_count] tests completed in [read_output:duration] seconds."

# Conclusion (10s)

## Summary

> surface: title
> subtitle: "All tests passing!"
> transition_in: crossfade 500ms

"That wraps up our demo. Everything is working correctly."
