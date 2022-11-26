# Obsidian Fandom

Inspired / forked from [obsidian-wikipedia](https://github.com/jmilldotdev/obsidian-wikipedia)

This is a plugin for Obsidian (https://obsidian.md).

This plugin gets the first section of Fandom and pastes it into your active note.

## Usage

This plugin has two commands:

- `Get Fandom for Active Note`, which gets the first section of Fandom using the active note's title as search term.
- `Get Fandom for Search Term`, which gets the first section of Fandom for a search term.

## Settings

Settings for this plugin include:

- **Language Prefix**: The prefix before `wikipedia.org` used to access the language of Fandom you want. (Default: 'en')
- **Extract Template**: The template to use to paste your extract. Available variables are {{text}}, {{searchTerm}}, and {{url}}
- **Bold Search Term?**: If set to True, bolds the first instance of the search term in the extract
- **Use Paragraph Template?**: If set to true, the paragraph template will be inserted for each paragraph of text for {{text}} in main template.
- **Paragraph Template**: If *Use Paragraph Template* is set to true, this template will be inserted for each paragraph in the text extract. Available variable: {{paragraphText}}.
