// Read-only presentation state. The authorized parent provides content; this
// module never signs a person in, writes a draft, or accepts a bid.
import { lots, event } from './data.js';
export const state={identity:null,online:true,lastViewed:null,snap:{closed:false,asOf:'Draft preview',lots:{}},outbox:[],watch:{},maxes:{},ui:{view:'cards',cat:'All',sort:'number',q:''}};
export function applyPacket(){state.snap.lots=Object.fromEntries(lots.map(l=>[l.id,{bids:[],added:0}]));state.snap.closed=false;if(!lots.some(l=>l.category===state.ui.cat))state.ui.cat='All';}
export const snapLot=id=>state.snap.lots[id]||{bids:[],added:0};
export const topBid=()=>null;
export const totalBids=()=>0;
export const minNext=lot=>lot.opening;
export const myBestBid=()=>null;
export const needsAttention=()=>0;
export const timeLeft=()=> 'Draft schedule';
export const isMine=()=>false;
export const isWatching=()=>false;
export const watchedLots=()=>[];
export const myMax=()=>null;
export const lotStatus=()=>({kind:'none',tone:'none',label:'',title:'',sub:''});
