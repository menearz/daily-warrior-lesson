#!/usr/bin/env node
// Append one lesson to lessons.json without replacing the file.
// Usage: node scripts/add-lesson.js new-lesson.json
// Skips if the date already exists; keeps newest-first order.
'use strict';
const fs = require('fs');
const entry = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cat = JSON.parse(fs.readFileSync('lessons.json', 'utf8'));
const before = cat.lessons.length;
if (cat.lessons.some((l) => l.date === entry.date)) { console.log(`skip: ${entry.date} already present`); process.exit(0); }
cat.lessons.push(entry);
cat.lessons.sort((a, b) => b.date.localeCompare(a.date));
if (cat.lessons.length < before) { console.error('count dropped; not writing'); process.exit(1); }
fs.writeFileSync('lessons.json', JSON.stringify(cat, null, 2) + '\n');
console.log(`added ${entry.date}: ${before} -> ${cat.lessons.length}`);
