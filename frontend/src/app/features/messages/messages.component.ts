import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface Recipient { id:number; name:string; username:string; email:string; role:string; }
interface MessageRow {
  id:number; subject:string; body:string; kind:string; senderName:string; senderRole:string;
  createdAt:string; readAt:string|null; recipientCount?:number; readCount?:number;
}

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Messages</h1>
        <p class="page-subtitle">Private internal communication between school users.</p>
      </div>
      @if (canCompose) { <button class="btn btn-primary" (click)="openCompose()"><app-icon name="plus" [size]="15"/> Compose</button> }
    </div>

    <div class="message-layout">
      <aside class="message-sidebar card">
        <button class="mail-tab" [class.active]="folder==='inbox'" (click)="folder='inbox'; load()">
          <span><app-icon name="inbox" [size]="16"/> Inbox</span><strong>{{ unread }}</strong>
        </button>
        <button class="mail-tab" [class.active]="folder==='sent'" (click)="folder='sent'; load()">
          <span><app-icon name="send" [size]="16"/> Sent</span>
        </button>
        <div class="mail-help">
          <strong>How messaging works</strong>
          <span>Messages are sent manually to selected active users. Notifications are automatic system alerts.</span>
        </div>
      </aside>

      <section class="card message-panel">
        <div class="message-toolbar">
          <div class="search-box">
            <app-icon name="search" [size]="15"/>
            <input class="form-control" placeholder="Search subject or sender…" [(ngModel)]="search"/>
          </div>
          <span class="message-count">{{ filtered.length }} messages</span>
        </div>

        @if (loading) {
          <div class="message-empty">Loading messages…</div>
        } @else if (!filtered.length) {
          <div class="message-empty">
            <div class="empty-icon"><app-icon name="mail" [size]="26"/></div>
            <strong>{{ folder==='inbox' ? 'Your inbox is empty' : 'No sent messages' }}</strong>
            <span>{{ folder==='inbox' ? 'Messages sent to you will appear here.' : 'Messages you compose will appear here.' }}</span>
          </div>
        } @else {
          <div class="message-list">
            @for (m of filtered; track m.id) {
              <button class="message-row" [class.unread]="folder==='inbox' && !m.readAt" (click)="openMessage(m)">
                <div class="message-avatar">{{ initials(folder==='inbox' ? m.senderName : m.senderName) }}</div>
                <div class="message-row-main">
                  <div class="message-row-top">
                    <strong>{{ folder==='inbox' ? m.senderName : (m.subject || 'No subject') }}</strong>
                    <time>{{ m.createdAt | date:'MMM d, h:mm a' }}</time>
                  </div>
                  <div class="message-row-subject" [class.muted]="folder==='sent'">{{ folder==='inbox' ? (m.subject || 'No subject') : m.body }}</div>
                  <div class="message-row-preview">{{ m.body }}</div>
                </div>
                @if (folder==='inbox' && !m.readAt) { <span class="unread-dot"></span> }
                @if (folder==='sent') { <span class="read-count">{{ m.readCount ?? 0 }}/{{ m.recipientCount ?? 0 }} read</span> }
              </button>
            }
          </div>
        }
      </section>
    </div>

    @if (selected) {
      <div class="modal-backdrop" (click)="selected=null">
        <div class="modal modal-lg message-detail" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="eyebrow">{{ folder==='inbox' ? 'INBOX' : 'SENT' }}</div>
              <div class="modal-title">{{ selected.subject || 'No subject' }}</div>
            </div>
            <button class="modal-close" (click)="selected=null"><app-icon name="x" [size]="16"/></button>
          </div>
          <div class="message-detail-meta">
            <div class="message-avatar large">{{ initials(folder==='sent' ? 'You' : selected.senderName) }}</div>
            <div>
              <strong>{{ folder==='sent' ? 'You' : (selected.senderName || 'Unknown') }}</strong>
              <span>{{ folder==='sent' ? ('Sent to ' + (selected.recipientCount ?? 0) + ' recipient' + ((selected.recipientCount ?? 0) === 1 ? '' : 's')) : (selected.senderRole ? (selected.senderRole | titlecase) + ' · ' : '') + (selected.createdAt | date:'MMM d, y, h:mm a') }}</span>
              @if (folder==='sent') {
                <span style="display:block;font-size:10px;color:var(--text-muted);margin-top:2px">{{ selected.createdAt | date:'MMM d, y, h:mm a' }} · {{ selected.readCount ?? 0 }}/{{ selected.recipientCount ?? 0 }} read</span>
              }
            </div>
          </div>
          <div class="message-body">{{ selected.body }}</div>
          <div class="message-detail-actions">
            @if (folder==='inbox' && !selected.readAt) {
              <button class="btn btn-primary" (click)="markRead(selected)"><app-icon name="check" [size]="15"/> Mark as read</button>
            }
            <button class="btn btn-ghost" (click)="selected=null">Close</button>
          </div>
        </div>
      </div>
    }

    @if (composeOpen) {
      <div class="modal-backdrop" (click)="closeCompose()">
        <div class="modal modal-lg" (click)="$event.stopPropagation()">
          <div class="modal-head"><div><div class="eyebrow">NEW MESSAGE</div><div class="modal-title">Compose message</div></div><button class="modal-close" (click)="closeCompose()"><app-icon name="x" [size]="16"/></button></div>
          <form (ngSubmit)="send()">
            <div class="form-group">
              <label>To *</label>
              <div class="recipient-picker">
                @for (r of selectedRecipients; track r.id) {
                  <span class="recipient-chip">{{ r.name }} <button type="button" (click)="removeRecipient(r.id)">×</button></span>
                }
                <input class="recipient-input" placeholder="Search people…" [(ngModel)]="recipientQuery" name="recipientQuery" (ngModelChange)="searchRecipients()"/>
              </div>
              @if (recipientOptions.length) {
                <div class="recipient-options">
                  @for (r of recipientOptions; track r.id) {
                    <button type="button" class="recipient-option" (click)="addRecipient(r)">
                      <span class="mini-avatar">{{ initials(r.name) }}</span><span><strong>{{ r.name }}</strong><small>{{ r.role | titlecase }} · {{ r.email }}</small></span>
                    </button>
                  }
                </div>
              }
              <small class="form-hint">Select one or more active users. Recipients are limited to your branch.</small>
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Subject *</label><input class="form-control" name="subject" [(ngModel)]="draft.subject" required maxlength="180"/></div>
              <div class="form-group"><label>Type</label><select class="form-control" name="kind" [(ngModel)]="draft.kind"><option value="direct">Direct</option><option value="group">Group</option><option value="broadcast">Broadcast</option></select></div>
            </div>
            @if (draft.kind==='broadcast') { <div class="info-note"><app-icon name="info" [size]="15"/> Broadcast sends to every active user in your branch.</div> }
            <div class="form-group"><label>Message *</label><textarea class="form-control message-compose-body" name="body" [(ngModel)]="draft.body" required maxlength="10000" rows="8" placeholder="Write your message…"></textarea></div>
            <div class="modal-actions"><button type="button" class="btn btn-ghost" (click)="closeCompose()">Cancel</button><button type="submit" class="btn btn-primary" [disabled]="sending || (!draft.body.trim()) || (draft.kind!=='broadcast' && !selectedRecipients.length)">{{ sending ? 'Sending…' : 'Send message' }} <app-icon name="send" [size]="14"/></button></div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .message-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;align-items:start}.message-sidebar{padding:8px}.mail-tab{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;padding:11px 12px;border-radius:8px;color:var(--text);cursor:pointer;font:inherit}.mail-tab span{display:flex;align-items:center;gap:9px}.mail-tab:hover,.mail-tab.active{background:var(--neutral-50);color:var(--primary)}.mail-tab strong{font-size:11px;background:var(--primary);color:#fff;border-radius:99px;padding:2px 7px}.mail-help{margin:16px 8px 8px;padding:12px;border:1px solid var(--border);border-radius:8px;display:grid;gap:5px;color:var(--text-muted);font-size:11px;line-height:1.5}.mail-help strong{color:var(--text);font-size:12px}.message-panel{min-width:0}.message-toolbar{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border)}.message-toolbar .search-box{max-width:360px;flex:1}.message-count{font-size:11px;color:var(--text-muted);margin-left:auto}.message-list{display:grid}.message-row{position:relative;width:100%;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:11px;text-align:left;border:0;border-bottom:1px solid var(--border);background:var(--surface);padding:13px 16px;cursor:pointer;color:var(--text);font:inherit}.message-row:hover,.message-row.unread{background:var(--neutral-50)}.message-row.unread{box-shadow:inset 3px 0 var(--primary)}.message-avatar,.mini-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:#fff;font-weight:800;font-size:11px}.message-avatar.large{width:42px;height:42px}.message-row-main{min-width:0}.message-row-top{display:flex;justify-content:space-between;gap:12px}.message-row-top strong{font-size:13px}.message-row-top time{font-size:10px;color:var(--text-muted);white-space:nowrap}.message-row-subject{font-size:12px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.message-row-subject.muted{font-weight:500;color:var(--text-muted)}.message-row-preview{font-size:11px;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.unread-dot{width:8px;height:8px;border-radius:50%;background:var(--primary);align-self:center}.read-count{font-size:10px;color:var(--text-muted);align-self:center;white-space:nowrap}.message-empty{min-height:320px;display:grid;place-content:center;text-align:center;gap:7px;color:var(--text-muted);font-size:12px}.message-empty strong{color:var(--text);font-size:14px}.empty-icon{margin:auto;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--neutral-50);color:var(--primary)}.message-detail-meta{display:flex;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid var(--border)}.message-detail-meta div:last-child{display:grid;gap:3px}.message-detail-meta span{font-size:11px;color:var(--text-muted)}.message-body{padding:22px 4px;min-height:180px;white-space:pre-wrap;line-height:1.65;font-size:13px}.eyebrow{font-size:9px;font-weight:800;letter-spacing:.08em;color:var(--primary);margin-bottom:3px}.message-detail-actions,.modal-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid var(--border)}.recipient-picker{min-height:44px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;background:var(--surface)}.recipient-input{border:0;outline:0;flex:1;min-width:160px;background:transparent;color:var(--text);padding:5px}.recipient-chip{display:inline-flex;align-items:center;gap:5px;background:var(--neutral-100);padding:5px 8px;border-radius:999px;font-size:11px}.recipient-chip button{border:0;background:none;color:var(--text-muted);cursor:pointer}.recipient-options{border:1px solid var(--border);border-radius:7px;margin-top:4px;overflow:hidden;background:var(--surface)}.recipient-option{width:100%;display:flex;align-items:center;gap:9px;text-align:left;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);padding:9px;cursor:pointer}.recipient-option:hover{background:var(--neutral-50)}.recipient-option span:last-child{display:grid}.recipient-option small{color:var(--text-muted);font-size:10px}.mini-avatar{width:28px;height:28px;font-size:9px}.info-note{display:flex;gap:7px;align-items:center;padding:9px 11px;margin-bottom:12px;background:var(--neutral-50);border-radius:7px;color:var(--text-muted);font-size:11px}.message-compose-body{resize:vertical;min-height:180px;line-height:1.55}.message-panel form{padding:4px 2px 0}.message-panel .form-group{margin-bottom:16px}.message-panel label{display:block;margin-bottom:7px;font-size:12px;font-weight:700;color:var(--text)}.message-panel .form-control{width:100%;box-sizing:border-box}.message-panel .form-grid{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:14px;margin-bottom:0}.message-panel .form-grid .form-group{min-width:0}.message-panel .recipient-picker{box-sizing:border-box;width:100%;min-height:46px;padding:7px 9px}.message-panel .recipient-options{width:100%;box-sizing:border-box}.message-panel .info-note{margin:0 0 16px}.message-panel .modal-actions{margin-top:20px;padding:16px 0 2px}.message-panel .modal-title{line-height:1.3}.message-panel .form-hint{display:block;margin-top:7px;line-height:1.4}@media(max-width:760px){.message-layout{grid-template-columns:1fr}.message-sidebar{display:flex;gap:4px}.mail-tab{flex:1}.mail-help{display:none}.message-row{padding:12px}.read-count{display:none}}
  `]
})
export class MessagesComponent implements OnInit {
  folder:'inbox'|'sent'='inbox'; rows:MessageRow[]=[]; loading=false; search=''; unread=0; selected:MessageRow|null=null;
  composeOpen=false; sending=false;  recipientQuery=''; recipientOptions:Recipient[]=[]; selectedRecipients:Recipient[]=[];
  draft={subject:'',body:'',kind:'direct'};
  constructor(private readonly api:ApiService,private readonly toasts:ToastService,private readonly perms:PermissionService){}
  get canCompose(){return this.perms.hasPermission('messages:create');}
  ngOnInit(){this.load();this.loadUnread();}
  get filtered(){const q=this.search.trim().toLowerCase(); return q?this.rows.filter(m=>[m.subject,m.body,m.senderName].some(v=>String(v??'').toLowerCase().includes(q))):this.rows;}
  load(){this.loading=true;const endpoint=this.folder==='inbox'?'/messages/inbox':'/messages/sent';this.api.get<MessageRow[]>(endpoint,{limit:100}).subscribe({next:r=>{this.rows=r?.data??[];this.loading=false;},error:e=>{this.loading=false;this.toasts.error(e?.error?.message||'Could not load messages');}})}
  loadUnread(){this.api.get<{count:number}>('/messages/unread-count').subscribe({next:r=>this.unread=Number(r?.data?.count??0),error:()=>{}})}
  openMessage(m:MessageRow){this.selected=m;if(this.folder==='inbox'&&!m.readAt)this.markRead(m);}
  markRead(m:MessageRow){this.api.patch(`/messages/${m.id}/read`,{}).subscribe({next:()=>{m.readAt=new Date().toISOString();this.unread=Math.max(0,this.unread-1);},error:e=>this.toasts.error(e?.error?.message||'Could not mark message as read')});}
  openCompose(){this.composeOpen=true;this.draft={subject:'',body:'',kind:'direct'};this.selectedRecipients=[];this.recipientQuery='';this.recipientOptions=[];}
  closeCompose(){this.composeOpen=false;}
  searchRecipients(){const q=this.recipientQuery.trim();if(!q){this.recipientOptions=[];return;}this.api.get<Recipient[]>('/messages/recipients',{q}).subscribe({next:r=>this.recipientOptions=(r?.data??[]).filter(x=>!this.selectedRecipients.some(s=>s.id===x.id)),error:()=>this.recipientOptions=[]});}
  addRecipient(r:Recipient){if(!this.selectedRecipients.some(x=>x.id===r.id))this.selectedRecipients.push(r);this.recipientQuery='';this.recipientOptions=[];}
  removeRecipient(id:number){this.selectedRecipients=this.selectedRecipients.filter(x=>x.id!==id);}
  send(){if(this.sending||!this.draft.body.trim()||(this.draft.kind!=='broadcast'&&!this.selectedRecipients.length))return;this.sending=true;const body={subject:this.draft.subject.trim(),body:this.draft.body.trim(),kind:this.draft.kind,recipientIds:this.selectedRecipients.map(r=>r.id)};this.api.post('/messages',body).subscribe({next:()=>{this.sending=false;this.toasts.success('Message sent');this.closeCompose();if(this.folder==='sent')this.load();},error:e=>{this.sending=false;this.toasts.error(e?.error?.message||'Could not send message');}})}
  initials(name:string|undefined|null){
    // Guard against undefined/null (sent messages used to crash here because the
    // backend response didn't include senderName).
    if(!name || typeof name!=='string') return 'U';
    return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()??'').join('')||'U';
  }
  userLabel(m:MessageRow){return 'You';}
}