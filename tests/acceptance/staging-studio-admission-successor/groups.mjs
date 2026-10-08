import {groups as inherited} from '../staging-studio-composition/cases.mjs';
import {entryObservations} from './entry.mjs';
import {checklist} from './oracles.mjs';
export const groups=inherited.map((group,index)=>index!==0?group:{...group,async run(f,record){
  return inherited[0].run(f,async(id,observation,validate,ui)=>{
    if(id!=='STUDIO_SAVED_SETUP_TRUTH')return record(id,observation,validate,ui);
    const entry=await entryObservations(ui);
    return record(id,{original:observation,entry},checklist,ui);
  });
}});
