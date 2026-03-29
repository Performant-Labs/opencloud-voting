export interface Feature {
  id: string
  title: string
  description: string
  created_by: string
  created_at: string
  vote_count: number
}

export interface FeatureWithVoted extends Feature {
  voted: boolean
}

export interface FeatureListResponse {
  features: Feature[]
  total: number
}

export interface ErrorResponse {
  error_code: string
  message: string
}
