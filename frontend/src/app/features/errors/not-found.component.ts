import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="card center-card">
      <h1 class="page-title">404</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a routerLink="/dashboard" class="btn btn-primary">Back to dashboard</a>
    </div>
  `,
})
export class NotFoundComponent {}