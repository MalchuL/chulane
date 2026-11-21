/** Print one operation result as JSON; credentials come from the selected web profile environment. */
import {operation} from './operations.ts'
const [, ,cmd,...args]=process.argv
try{console.log(JSON.stringify(await operation(cmd,cmd==='propose_rename'?{id:Number(args[0]),title:args.slice(1).join(' ')}:args.join(' ')),null,2))}
catch(e){console.error(e.message);process.exitCode=1}
