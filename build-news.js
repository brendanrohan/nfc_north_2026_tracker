#!/usr/bin/env node

/**
 * Build script to convert markdown news posts to news.json
 *
 * Usage: node build-news.js
 *
 * Reads all .md files from the news/ directory, parses frontmatter
 * and content, and outputs news.json sorted by date (newest first).
 */

const fs = require('fs');
const path = require('path');

const NEWS_DIR = path.join(__dirname, 'news');
const OUTPUT_FILE = path.join(__dirname, 'news.json');

/**
 * Parse YAML frontmatter from markdown content
 * Returns { frontmatter: object, content: string }
 */
function parseFrontmatter(markdown) {
  const lines = markdown.split('\n');

  if (lines[0].trim() !== '---') {
    return { frontmatter: {}, content: markdown };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: {}, content: markdown };
  }

  const yamlLines = lines.slice(1, endIndex);
  const content = lines.slice(endIndex + 1).join('\n').trim();
  const frontmatter = parseYaml(yamlLines);

  return { frontmatter, content };
}

/**
 * Simple YAML parser for our frontmatter structure
 * Handles: strings, arrays of objects
 */
function parseYaml(lines) {
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentObject = null;
  let inArray = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Check indentation level
    const indent = line.search(/\S/);

    // Top-level key (no indentation or minimal)
    if (indent === 0) {
      // Save previous array if exists
      if (currentArray && currentKey) {
        if (currentObject && Object.keys(currentObject).length > 0) {
          currentArray.push(currentObject);
        }
        result[currentKey] = currentArray;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value) {
          // Simple key: value
          result[key] = parseValue(value);
          currentKey = null;
          currentArray = null;
          inArray = false;
        } else {
          // Key with nested content (array)
          currentKey = key;
          currentArray = [];
          currentObject = null;
          inArray = true;
        }
      }
    } else if (inArray && trimmed.startsWith('- ')) {
      // New array item
      if (currentObject && Object.keys(currentObject).length > 0) {
        currentArray.push(currentObject);
      }
      currentObject = {};

      // Parse the first property on the same line as -
      const rest = trimmed.slice(2);
      const colonIndex = rest.indexOf(':');
      if (colonIndex > 0) {
        const key = rest.slice(0, colonIndex).trim();
        const value = rest.slice(colonIndex + 1).trim();
        currentObject[key] = parseValue(value);
      }
    } else if (inArray && currentObject) {
      // Property of current array item
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        currentObject[key] = parseValue(value);
      }
    }
  }

  // Don't forget the last array/object
  if (currentArray && currentKey) {
    if (currentObject && Object.keys(currentObject).length > 0) {
      currentArray.push(currentObject);
    }
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Parse a YAML value (handle quoted strings, etc.)
 */
function parseValue(str) {
  if (!str) return '';

  // Remove surrounding quotes if present
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  return str;
}

/**
 * Convert markdown links [text](url) to HTML <a> tags
 */
function markdownToHtml(text) {
  // Convert [text](url) to <a href="url" target="_blank" rel="noopener">text</a>
  return text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
}

/**
 * Parse date from filename (2026-07-28-slug.md -> July 28, 2026)
 */
function parseDate(filename) {
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const monthName = months[parseInt(month, 10) - 1];
  const dayNum = parseInt(day, 10);

  return `${monthName} ${dayNum}, ${year}`;
}

/**
 * Generate ID from filename (2026-07-28-training-camps.md -> training-camps-2026)
 */
function generateId(filename) {
  const match = filename.match(/^(\d{4})-\d{2}-\d{2}-(.+)\.md$/);
  if (!match) return filename.replace('.md', '');

  const [, year, slug] = match;
  return `${slug}-${year}`;
}

/**
 * Get sortable date from filename for ordering
 */
function getSortDate(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '0000-00-00';
}

// Main execution
function main() {
  // Read all .md files from news directory
  if (!fs.existsSync(NEWS_DIR)) {
    console.error('Error: news/ directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(NEWS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a))); // newest first

  console.log(`Found ${files.length} news posts`);

  const newsItems = [];

  for (const file of files) {
    const filepath = path.join(NEWS_DIR, file);
    const raw = fs.readFileSync(filepath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(raw);

    const item = {
      id: generateId(file),
      date: parseDate(file),
      headline: frontmatter.headline || 'Untitled',
      text: markdownToHtml(content)
    };

    // Add optional fields if present
    if (frontmatter.camps) {
      item.camps = frontmatter.camps;
    }

    if (frontmatter.links) {
      item.links = frontmatter.links;
    }

    newsItems.push(item);
    console.log(`  ✓ ${file}`);
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newsItems, null, 2) + '\n');
  console.log(`\nWrote ${OUTPUT_FILE}`);
}

main();
