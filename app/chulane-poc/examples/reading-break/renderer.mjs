/** Add a reflection paragraph to Rivto's slash menu. Its stable type remains in the document when the plugin is removed. */
export default function blocks({React,MarkdownContent,BLOCK_TEXT_METADATA_KEY}){
  return [{
    definition:{type:'reading-break.reflection',title:'Reflection',metadata:{[BLOCK_TEXT_METADATA_KEY]:true}},
    slashCommand:{title:'Reflection',group:'Reading break'},
    render:props=>React.createElement('section',{'aria-label':'Reflection'},
      React.createElement('small',null,'Reflection'),React.createElement(MarkdownContent,props)),
  }]
}
