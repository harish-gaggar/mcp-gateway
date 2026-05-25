/** Bearer-token auth for local evaluation (OAuth/JWE described in paper). */

export interface Principal {
  id: string
  rawToken: string
}

export class TokenAuthenticator {
  private readonly tokenToPrincipal: Map<string, string>

  constructor(tokens: Record<string, string>) {
    this.tokenToPrincipal = new Map(
      Object.entries(tokens).map(([token, principal]) => [
        token,
        principal.replace(/^principal:/, ''),
      ]),
    )
  }

  authenticate(authorizationHeader: string | undefined): Principal | null {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return null
    }
    const token = authorizationHeader.slice(7).trim()
    const principalId = this.tokenToPrincipal.get(token)
    if (!principalId) {
      return null
    }
    return { id: principalId, rawToken: token }
  }
}
