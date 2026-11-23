/** Configure the GFM table and strikethrough syntax shared by page import and connected or offline export. */
import {defaultHandlers,type Options} from 'mdast-util-to-markdown'
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
  handlers:{
    text(node,parent,state,info){
      if(!('chulaneSpelling' in node))return defaultHandlers.text(node,parent,state,info)
      if(node.chulaneSpelling==='escaped')return '\\'+node.value
      if(node.chulaneSpelling==='tag')return node.value
      const open=node.value.startsWith('[[')?'[[':'['
      const close=']'.repeat(open.length)
      // Let the GFM writer escape pipes and inline punctuation inside the title.
      const title=state.safe(node.value.slice(open.length,-close.length),{...info,before:open,after:close})
      // A colon immediately after a leading [page] can turn a standalone cell into a link definition.
      const suffix=info.after.startsWith(':')?'\\':''
      return open+title+close+suffix
    }
  },
  unsafe:[
    ...[' ', '\t'].flatMap(character=>[
      {character,before:'\\|',inConstruct:'tableCell' as const},
      {character,after:'\\|',inConstruct:'tableCell' as const}
    ]),
    {character:'\n',inConstruct:'phrasing'},
    {character:'\r',inConstruct:'phrasing'}
  ]
}
