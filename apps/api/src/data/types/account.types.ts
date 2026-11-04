import type { LocalDate, LocalTime } from './common.types';
import type { Municipality } from './reference.types';

/** Gender, informative only (BR-ACC-09). DB enum `gender`. */
export type Gender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';

/** Single role of an account (BR-ACC-08). DB enum `user_role`. */
export type UserRole = 'user' | 'moderator' | 'admin';

/** Who may see a profile section (BR-ACC-14). DB enum `visibility_level`. */
export type VisibilityLevel = 'public' | 'members' | 'friends' | 'only_me';

/** Who may invite the user to a circle (BR-ACC-15). DB enum `invite_policy`. */
export type InvitePolicy = 'everyone' | 'friends' | 'nobody';

/** Purpose of a single-use account token (BR-ACC-07). DB enum `account_token_purpose`. */
export type AccountTokenPurpose = 'email_verification' | 'password_reset';

/** ISO day of the week: 1 = Monday, 7 = Sunday (BR-ACC-12). */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A recurring weekly availability slot in local time (BR-ACC-12). */
export type AvailabilitySlot = {
  dayOfWeek: DayOfWeek;
  startTime: LocalTime;
  endTime: LocalTime;
};

/** A sport declared with the self-declared level (BR-ACC-10). Input of `setSports`. */
export type UserSportLevel = {
  sportId: string;
  skillLevelId: string;
};

/** A sport of a user, resolved with its names for display. */
export type ProfileSport = {
  sport: { id: string; code: string; name: string };
  skillLevel: { id: string; code: string; name: string };
};

/** Input of `setRatings`: a numeric value for a numeric system, or a grade for a graded system (BR-ACC-11). */
export type UserRatingInput = {
  ratingSystemId: string;
  numericValue?: number;
  ratingGradeId?: string;
};

/** A rating of a user, resolved: the system code and its numeric value or grade code (BR-ACC-11). */
export type UserRating = {
  ratingSystemId: string;
  systemCode: string;
  numericValue: number | null;
  gradeCode: string | null;
};

/** Privacy and interaction settings of an account (BR-ACC-14, BR-ACC-15). */
export type UserSettings = {
  profileVisibility: VisibilityLevel;
  statsVisibility: VisibilityLevel;
  badgesVisibility: VisibilityLevel;
  reliabilityVisibility: VisibilityLevel;
  circlesVisibility: VisibilityLevel;
  historyVisibility: VisibilityLevel;
  followsVisibility: VisibilityLevel;
  isPrivateAccount: boolean;
  hideFromRankings: boolean;
  circleInvitePolicy: InvitePolicy;
};

/** Everything the user sees about their own account, including decrypted personal data. */
export type MeProfile = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  birthDate: LocalDate;
  gender: Gender | null;
  avatarPath: string | null;
  role: UserRole;
  municipality: Municipality;
  sports: ProfileSport[];
  ratings: UserRating[];
  availability: AvailabilitySlot[];
  settings: UserSettings;
  createdAt: Date;
  lastActiveAt: Date | null;
  deletionRequestedAt: Date | null;
};

/** A profile whose profile section is hidden from the viewer (BR-ACC-14). */
export type HiddenProfile = {
  id: string;
  username: string;
  avatarPath: string | null;
  isHidden: true;
};

/** A profile visible to the viewer. Never contains email, birth date or role. */
export type VisibleProfile = {
  id: string;
  username: string;
  avatarPath: string | null;
  isHidden: false;
  firstName: string;
  gender: Gender | null;
  municipality: { id: string; name: string };
  sports: ProfileSport[];
  ratings: UserRating[];
  availability: AvailabilitySlot[];
};

/** Profile as seen by another viewer (BR-ACC-14). */
export type PublicProfile = HiddenProfile | VisibleProfile;

/** Login data of an account found by email. Used by the developers' authentication code only. */
export type LoginInfo = {
  userId: string;
  passwordHash: string | null;
  emailVerified: boolean;
  role: UserRole;
  deletionRequestedAt: Date | null;
};

/** A user found by `searchUsers`. */
export type UserSearchResult = {
  id: string;
  username: string;
  avatarPath: string | null;
};

/** Input of `AuthRepository.createUserWithPassword`. The password is hashed by the developers (argon2id). */
export type CreateUserWithPasswordInput = {
  username: string;
  email: string;
  passwordHash: string;
  firstName: string;
  birthDate: LocalDate;
  municipalityId: string;
  gender?: Gender | null;
};

/** Input of `AuthRepository.createUserWithGoogle`. */
export type CreateUserWithGoogleInput = {
  username: string;
  email: string;
  emailVerified: boolean;
  googleSubject: string;
  firstName: string;
  birthDate: LocalDate;
  municipalityId: string;
  gender?: Gender | null;
};

/** Input of `AuthRepository.issueRefreshToken`. The raw token is hashed by the data layer. */
export type IssueRefreshTokenInput = {
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent?: string | null;
  familyId?: string;
};

/** Input of `AuthRepository.rotateRefreshToken`. Both tokens are raw; they are hashed by the data layer. */
export type RotateRefreshTokenInput = {
  oldToken: string;
  newToken: string;
  expiresAt: Date;
  userAgent?: string | null;
};

/** Input of `AuthRepository.createAccountToken`. The raw token is hashed by the data layer. */
export type CreateAccountTokenInput = {
  userId: string;
  purpose: AccountTokenPurpose;
  token: string;
  expiresAt: Date;
};

/** Patch of `UserRepository.updateProfile`: only the given fields change. */
export type UpdateProfilePatch = {
  firstName?: string;
  municipalityId?: string;
  gender?: Gender | null;
  avatarPath?: string | null;
};
