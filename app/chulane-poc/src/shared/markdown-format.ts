/** Configure the GFM table and strikethrough syntax shared by page import and connected or offline export. */
import type {Options} from 'mdast-util-to-markdown'
import {gfmTable} from 'micromark-extension-gfm-table'
import {gfmStrikethrough} from 'micromark-extension-gfm-strikethrough'
import {gfmTableFromMarkdown,gfmTableToMarkdown} from 'mdast-util-gfm-table'
import {gfmStrikethroughFromMarkdown,gfmStrikethroughToMarkdown} from 'mdast-util-gfm-strikethrough'

export const markdownSyntax={
  extensions:[gfmTable(),gfmStrikethrough()],
  mdastExtensions:[gfmTableFromMarkdown(),gfmStrikethroughFromMarkdown()]
}
export const markdownFormat={extensions:[gfmTableToMarkdown({tablePipeAlign:false}),gfmStrikethroughToMarkdown()]}

// A table cell is edited as standalone inline Markdown. Keep its literal data through both serializations.
export const tableMarkdownFormat:Options={
  ...markdownFormat,
  // Autolinks cannot escape a pipe without changing their visible text or destination.
  resourceLink:true,
  unsafe:[
    ...[' ', '\t'].flatMap(character=>[
      {character,before:'\\|',inConstruct:'tableCell' as const},
      {character,after:'\\|',inConstruct:'tableCell' as const}
    ]),
    {character:'\n',inConstruct:'phrasing'},
    {character:'\r',inConstruct:'phrasing'}
  ]
}
