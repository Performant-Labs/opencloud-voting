export interface Feature {
  id: string;
  title: string;
  description: string;
  created_by: string;
  created_at: string;
  vote_count: number;
  voted: boolean;
}

export interface FeatureListResponse {
  features: Feature[];
  total: number;
}

export interface ErrorResponse {
  error_code: string;
  message: string;
}

export interface Comment {
  id: string;
  feature_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

export interface CommentListResponse {
  comments: Comment[];
  total: number;
}
