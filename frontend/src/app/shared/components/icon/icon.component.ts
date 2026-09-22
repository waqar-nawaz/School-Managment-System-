import { Component, Input, computed, signal } from '@angular/core';

type Prim = [tag: string, attrs: Record<string, string | number>];

const ICONS: Record<string, Prim[]> = {
  home: [
    ['path', { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ['polyline', { points: '9 22 9 12 15 12 15 22' }],
  ],
  dashboard: [
    ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }],
  ],
  users: [
    ['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  user: [
    ['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 12, cy: 7, r: 4 }],
  ],
  'user-check': [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 8.5, cy: 7, r: 4 }],
    ['polyline', { points: '17 11 19 13 23 9' }],
  ],
  briefcase: [
    ['rect', { x: 2, y: 7, width: 20, height: 14, rx: 2 }],
    ['path', { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }],
  ],
  book: [
    ['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }],
    ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }],
  ],
  bookmark: [['path', { d: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' }]],
  calendar: [
    ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    ['line', { x1: 16, y1: 2, x2: 16, y2: 6 }],
    ['line', { x1: 8, y1: 2, x2: 8, y2: 6 }],
    ['line', { x1: 3, y1: 10, x2: 21, y2: 10 }],
  ],
  layers: [
    ['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }],
    ['polyline', { points: '2 17 12 22 22 17' }],
    ['polyline', { points: '2 12 12 17 22 12' }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
  'check-square': [
    ['polyline', { points: '9 11 12 14 22 4' }],
    ['path', { d: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' }],
  ],
  'file-text': [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
    ['line', { x1: 16, y1: 13, x2: 8, y2: 13 }],
    ['line', { x1: 16, y1: 17, x2: 8, y2: 17 }],
  ],
  award: [
    ['circle', { cx: 12, cy: 8, r: 7 }],
    ['polyline', { points: '8.21 13.89 7 23 12 20 17 23 15.79 13.88' }],
  ],
  clipboard: [
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
  ],
  'trending-up': [
    ['polyline', { points: '23 6 13.5 15.5 8.5 10.5 1 18' }],
    ['polyline', { points: '17 6 23 6 23 12' }],
  ],
  'trending-down': [
    ['polyline', { points: '23 18 13.5 8.5 8.5 13.5 1 6' }],
    ['polyline', { points: '17 18 23 18 23 12' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['polyline', { points: '12 6 12 12 16 14' }],
  ],
  list: [
    ['line', { x1: 8, y1: 6, x2: 21, y2: 6 }],
    ['line', { x1: 8, y1: 12, x2: 21, y2: 12 }],
    ['line', { x1: 8, y1: 18, x2: 21, y2: 18 }],
    ['line', { x1: 3, y1: 6, x2: 3.01, y2: 6 }],
    ['line', { x1: 3, y1: 12, x2: 3.01, y2: 12 }],
    ['line', { x1: 3, y1: 18, x2: 3.01, y2: 18 }],
  ],
  folder: [['path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }]],
  'credit-card': [
    ['rect', { x: 1, y: 4, width: 22, height: 16, rx: 2 }],
    ['line', { x1: 1, y1: 10, x2: 23, y2: 10 }],
  ],
  dollar: [
    ['line', { x1: 12, y1: 1, x2: 12, y2: 23 }],
    ['path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' }],
  ],
  scale: [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M5 7h14' }],
    ['path', { d: 'M5 7l-3 6h6z' }],
    ['path', { d: 'M19 7l-3 6h6z' }],
  ],
  map: [
    ['polygon', { points: '1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6' }],
    ['line', { x1: 8, y1: 2, x2: 8, y2: 18 }],
    ['line', { x1: 16, y1: 6, x2: 16, y2: 22 }],
  ],
  truck: [
    ['rect', { x: 1, y: 3, width: 15, height: 13 }],
    ['polygon', { points: '16 8 20 8 23 11 23 16 16 16 16 8' }],
    ['circle', { cx: 5.5, cy: 18.5, r: 2.5 }],
    ['circle', { cx: 18.5, cy: 18.5, r: 2.5 }],
  ],
  'map-pin': [
    ['path', { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }],
    ['circle', { cx: 12, cy: 10, r: 3 }],
  ],
  bed: [
    ['path', { d: 'M2 4v16' }],
    ['path', { d: 'M2 8h18a2 2 0 0 1 2 2v10' }],
    ['path', { d: 'M2 17h20' }],
    ['path', { d: 'M6 8v9' }],
  ],
  bell: [
    ['path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }],
    ['path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }],
  ],
  mail: [
    ['path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }],
    ['polyline', { points: '22 6 12 13 2 6' }],
  ],
  message: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }]],
  megaphone: [
    ['path', { d: 'M3 11l18-5v12L3 14v-3z' }],
    ['path', { d: 'M11.6 16.8a3 3 0 1 1-5.8-1.6' }],
  ],
  activity: [['polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' }]],
  alert: [
    ['path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }],
    ['line', { x1: 12, y1: 9, x2: 12, y2: 13 }],
    ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }],
  ],
  package: [
    ['path', { d: 'M16.5 9.4l-9-5.19' }],
    ['path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }],
    ['polyline', { points: '3.27 6.96 12 12.01 20.73 6.96' }],
    ['line', { x1: 12, y1: 22.08, x2: 12, y2: 12 }],
  ],
  monitor: [
    ['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }],
    ['line', { x1: 8, y1: 21, x2: 16, y2: 21 }],
    ['line', { x1: 12, y1: 17, x2: 12, y2: 21 }],
  ],
  image: [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }],
    ['polyline', { points: '21 15 16 10 5 21' }],
  ],
  shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  lock: [
    ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }],
  ],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }],
  ],
  'bar-chart': [
    ['line', { x1: 18, y1: 20, x2: 18, y2: 10 }],
    ['line', { x1: 12, y1: 20, x2: 12, y2: 4 }],
    ['line', { x1: 6, y1: 20, x2: 6, y2: 14 }],
  ],
  refresh: [
    ['polyline', { points: '23 4 23 10 17 10' }],
    ['polyline', { points: '1 20 1 14 7 14' }],
    ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }],
  ],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }],
  ],
  plus: [
    ['line', { x1: 12, y1: 5, x2: 12, y2: 19 }],
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
  ],
  edit: [
    ['path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
    ['path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }],
  ],
  trash: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['line', { x1: 10, y1: 11, x2: 10, y2: 17 }],
    ['line', { x1: 14, y1: 11, x2: 14, y2: 17 }],
  ],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
  x: [
    ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }],
    ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }],
  ],
  'log-out': [
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
    ['polyline', { points: '16 17 21 12 16 7' }],
    ['line', { x1: 21, y1: 12, x2: 9, y2: 12 }],
  ],
  'log-in': [
    ['path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' }],
    ['polyline', { points: '10 17 15 12 10 7' }],
    ['line', { x1: 15, y1: 12, x2: 3, y2: 12 }],
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 5 }],
    ['line', { x1: 12, y1: 1, x2: 12, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 23 }],
    ['line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }],
    ['line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }],
    ['line', { x1: 1, y1: 12, x2: 3, y2: 12 }],
    ['line', { x1: 21, y1: 12, x2: 23, y2: 12 }],
    ['line', { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 }],
    ['line', { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 }],
  ],
  moon: [['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }]],
  menu: [
    ['line', { x1: 3, y1: 12, x2: 21, y2: 12 }],
    ['line', { x1: 3, y1: 6, x2: 21, y2: 6 }],
    ['line', { x1: 3, y1: 18, x2: 21, y2: 18 }],
  ],
  'chevron-left': [['polyline', { points: '15 18 9 12 15 6' }]],
  'chevron-right': [['polyline', { points: '9 18 15 12 9 6' }]],
  graduation: [
    ['path', { d: 'M22 10L12 5 2 10l10 5 10-5z' }],
    ['path', { d: 'M6 12v5c3 3 9 3 12 0v-5' }],
  ],
  heart: [
    ['path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z' }],
  ],
  circle: [['circle', { cx: 12, cy: 12, r: 10 }]],
  eye: [
    ['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  'eye-off': [
    ['path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }],
    ['line', { x1: 1, y1: 1, x2: 23, y2: 23 }],
  ],
};

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="app-icon">
      @for (p of prims(); track $index) {
        @switch (p[0]) {
          @case ('path') { <path [attr.d]="p[1]['d']" /> }
          @case ('circle') { <circle [attr.cx]="p[1]['cx']" [attr.cy]="p[1]['cy']" [attr.r]="p[1]['r']" /> }
          @case ('line') {
            <line [attr.x1]="p[1]['x1']" [attr.y1]="p[1]['y1']" [attr.x2]="p[1]['x2']" [attr.y2]="p[1]['y2']" />
          }
          @case ('polyline') { <polyline [attr.points]="p[1]['points']" /> }
          @case ('polygon') { <polygon [attr.points]="p[1]['points']" /> }
          @case ('rect') {
            <rect
              [attr.x]="p[1]['x']"
              [attr.y]="p[1]['y']"
              [attr.width]="p[1]['width']"
              [attr.height]="p[1]['height']"
              [attr.rx]="p[1]['rx']" />
          }
        }
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; } .app-icon { display: block; flex-shrink: 0; }'],
})
export class IconComponent {
  @Input() size: number | string = 18;
  @Input() strokeWidth: number | string = 2;

  private readonly _name = signal('circle');

  @Input() set name(v: string) {
    this._name.set(v);
  }

  readonly prims = computed<Prim[]>(() => ICONS[this._name()] ?? ICONS['circle']);
}
