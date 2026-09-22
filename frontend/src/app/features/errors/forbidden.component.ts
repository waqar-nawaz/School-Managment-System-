import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="card center-card">
      <h1 class="page-title">403</h1>
      <p>You don't have permission to access this page.</p>
      <a routerLink="/dashboard" class="btn btn-primary">Back to dashboard</a>
    </div>
  `,
})
export class ForbiddenComponent {}