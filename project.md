# Project: archi-scripts

## Purpose
JavaScript scripting plugin for the Archi Enterprise Architecture modeling tool.
Extends Archi with automated scripting capabilities via the jArchi plugin.

## Domain
ArchiMate model management, including:
- View generation: create and lay out ArchiMate diagram views from model elements
- Export / import: exchange model data with external formats
- Reporting: generate structured output from model content
- Appearance / styling: automate element colors, fonts, visual properties
- Merging: combine or synchronize model fragments
- Model analysis: traverse and query model relationships and properties

## Runtime constraints
- Runtime: jArchi plugin on GraalVM (not Node.js)
- Module system: CommonJS via require()
- No Node.js APIs — no fs, path, or process
- Java interop: Java.type(), Java.extend()
- File I/O: java.io.* or java.nio.file.*

## Scope
All scripts live under `Scripts/`. Each subfolder is an independent domain.
Subfolder-specific rules are defined in that subfolder's own rule file.
