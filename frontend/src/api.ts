export type Sport='tennis'|'padel';
export type Role='player'|'coach'|'admin';
export type User={id:number;name:string;email:string;role:Role;sport:Sport;level:string;district:string;priority:string;experience:string;onboarding_complete:boolean;verified:boolean};
export type Slot={id:number;starts_at:string;duration_minutes:number;available:boolean};
export type Court={id:number;name:string;club:string;district:string;sport:Sport;surface:string;indoor:boolean;price:number;address:string};
export type Coach={id:number;name:string;headline:string;bio:string;sports:Sport[];districts:string[];club:string;experience_years:number;rating:number;reviews:number;price:number;color:string;emoji:string;verified:boolean;court_booker:'player'|'coach';levels:string[];formats:string[];split_price:number;group_price:number;cancellation_policy:string;slots?:Slot[];courts?:Court[]};
export type FeedItem={coach:Coach;court:Court;slot:Slot;total_price:number};
export type BookingStatus='awaiting_court'|'confirmed'|'completed'|'no_show'|'cancelled';
export type Booking={id:number;status:BookingStatus;starts_at:string;duration_minutes:number;coach_id:number;coach_name:string;player_name:string;club:string;sport:Sport;price:number;court_price:number;court:Court|null;court_booker:'player'|'coach';court_confirmation_code:string;objective:string;experience:string;need_racket:boolean;comment:string;created_at:string};
export type Questionnaire={sport:Sport;experience:string;level:string;district:string;convenient_time:string;priority:string;goal:string};
export type CoachMine={profile:Coach|null;settings:Record<string,string|number>|null;courts:number[];slots:Slot[]};
export type AuthResponse={access_token:string;user:User};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
export class ApiError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
export async function api<T>(path:string,options:RequestInit={},auth=true):Promise<T>{
 const token=localStorage.getItem('fitspot_token');const headers=new Headers(options.headers);
 if(options.body)headers.set('Content-Type','application/json');if(auth&&token)headers.set('Authorization',`Bearer ${token}`);
 let response:Response;
 try{response=await fetch(`${base}/api${path}`,{...options,headers})}catch{throw new ApiError(0,'Не удалось связаться с API. Запустите FastAPI на порту 8000.')}
 if(!response.ok){let message=`Ошибка ${response.status}`;try{const data=await response.json();if(typeof data.detail==='string')message=data.detail;else if(Array.isArray(data.detail))message='Проверьте заполненные поля'}catch{/* noop */}throw new ApiError(response.status,message)}
 return response.json() as Promise<T>
}
export function post<T>(url:string,body:object={}){return api<T>(url,{method:'POST',body:JSON.stringify(body)})}
export const price=(v:number)=>new Intl.NumberFormat('ru-RU').format(v)+' ₽';
export const sportLabel=(v:Sport)=>v==='tennis'?'Теннис':'Падел';
export const dt=(v:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(v.slice(0,10)+'T'+v.slice(11,16)));
export const shortDay=(v:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',weekday:'short'}).format(new Date(v.slice(0,10)+'T12:00'));
export const hour=(v:string)=>v.slice(11,16);
