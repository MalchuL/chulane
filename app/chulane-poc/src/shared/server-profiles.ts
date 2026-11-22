/** Desktop profile picker contract. The local renderer receives workspace names and IDs, never remote credentials. */
import type {Item} from './library'

export type ServerProfile={origin:string;status:'connected'|'signed-out'|'unavailable';workspaces:Item[]}
export interface ServerProfiles{
  list():Promise<ServerProfile[]>
  open(address:string,workspace?:number):Promise<void>
  forget(origin:string):Promise<void>
}
declare global {interface Window {chulaneServers?:ServerProfiles}}
