---
title: "CLI Tool Demo"
duration: 1m30s
voice: "af_heart"
viewport: 1280x720
---

# Getting Started (30s)

## Installation

> surface: title
> subtitle: "Setting up the project"

"Welcome to our CLI tool demo. Let's get started with installation."

## Install Dependencies

> surface: terminal
> shell: bash

"First, we'll install the required packages."

- run: "npm init -y"
- wait: 1s
- type_command: "npm install express"

# Usage (45s)

## Basic Server

> surface: terminal

"Now let's create a simple server."

- type_command: "node -e \"const http = require('http'); const s = http.createServer((req, res) => { res.end('Hello!'); }); s.listen(3000, () => console.log('Server running on port 3000'));\""
- wait_for_output: "Server running"

"The server is running. Let's test it."

- run: "curl http://localhost:3000"

## Check Output

> surface: terminal
> transition_in: crossfade 300ms

"Let's verify the response."

- run: "curl -s http://localhost:3000"
  capture:
  response: regex("(.+)")

"The server responded with [read_output:response]."

# Wrap Up (15s)

## Closing

> surface: title
> subtitle: "Thanks for watching!"

"That concludes our CLI tool demo."
