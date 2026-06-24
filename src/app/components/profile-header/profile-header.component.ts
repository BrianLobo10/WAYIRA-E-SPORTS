import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { UserProfile } from '../../services/firebase.service';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-header.component.html',
  styleUrls: ['./profile-header.component.css']
})
export class ProfileHeaderComponent {
  profile = input.required<UserProfile>();
  isOwnProfile = input<boolean>(false);
  isFollowing = input<boolean>(false);
  handle = input<string>('');
  joinDate = input<string>('');
  followersCount = input<number>(0);
  followingCount = input<number>(0);
  activitiesCount = input<number>(0);
  rankLabel = input<string | null>(null);
  rankIconUrl = input<string | null>(null);
  /** Tarjeta Solo Q / mejor rango (estilo Aurea) */
  scoreCard = input<{ period: string; value: number | string; label: string } | null>(null);
  uploadingCover = input<boolean>(false);

  coverSelected = output<Event>();
  editProfile = output<void>();
  follow = output<void>();
  message = output<void>();
  openFollowers = output<void>();
  openFollowing = output<void>();
  coverConfirm = output<void>();
  coverCancel = output<void>();
  showCoverConfirm = input<boolean>(false);
  editCoverPreview = input<string | null>(null);

  onCoverChange(e: Event) {
    this.coverSelected.emit(e);
  }
}
