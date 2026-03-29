export interface Feature {
  id: string
  title: string
  description: string
  created_by: string
  created_at: string
  vote_count: number
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
