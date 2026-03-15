export interface ParsedParam {
  name: string
  type: string
  required: boolean
  description: string
}

export interface ParsedMethod {
  method: string
  description: string
  params: ParsedParam[]
  requestBody: ParsedParam[]
  auth: boolean
  maxDuration?: number
  streaming: boolean
}

export interface ParsedRoute {
  filePath: string
  apiPath: string
  group: string
  methods: ParsedMethod[]
}

export interface ApiGroup {
  name: string
  description: string
  routes: ParsedRoute[]
}
