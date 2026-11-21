/** Workspace library response shared by the renderer and external tools. */
export type Item={id:number;name:string}
export type Page={id:number;title:string;project:number|null;day:string|null;deleted:number;plain:string}
export type Library={proposals:{id:number;page:number|null;title:string}[];role:string;desktop:boolean;workspaces:Item[];projects:Item[];pages:Page[]}
