// Refresh catalog markup without replacing unchanged images and editing controls.
// Keys retain lot/heading identity when siblings are inserted, removed or reordered.
const key=node=>node.nodeType===1?(node.id?`id:${node.id}`:node.hasAttribute('data-key')?`key:${node.getAttribute('data-key')}`:node.hasAttribute('data-anchor')?`lot:${node.getAttribute('data-anchor')}`:null):null;
const compatible=(node,next)=>node&&node.nodeType===next.nodeType&&(node.nodeType!==1||(node.localName===next.localName&&node.namespaceURI===next.namespaceURI&&key(node)===key(next)));
function patch(node,next){
 if(node.nodeType!==1){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
 for(const attr of [...node.attributes])if(!next.hasAttribute(attr.name))node.removeAttribute(attr.name);
 for(const attr of next.attributes)if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);
 children(node,next);
 // Setting an already matching value resets the caret on some mobile browsers.
 if(['input','textarea','select'].includes(node.localName)&&node.value!==next.value)node.value=next.value;
 if(node.localName==='input'&&['checkbox','radio'].includes(node.type)&&node.checked!==next.checked)node.checked=next.checked;
}
function children(parent,next){
 let cursor=parent.firstChild;
 for(const wanted of [...next.childNodes]){
  let node=cursor;
  if(!compatible(node,wanted)){
   node=null;
   if(key(wanted))for(let sibling=cursor;sibling;sibling=sibling.nextSibling)if(compatible(sibling,wanted)){node=sibling;break;}
   if(node)parent.insertBefore(node,cursor);
   else{node=wanted.cloneNode(true);parent.insertBefore(node,cursor);}
  }
  patch(node,wanted);cursor=node.nextSibling;
 }
 while(cursor){const nextSibling=cursor.nextSibling;cursor.remove();cursor=nextSibling;}
}
export function reconcileHTML(target,html){
 const template=document.createElement('template');template.innerHTML=html;
 children(target,template.content);
}
