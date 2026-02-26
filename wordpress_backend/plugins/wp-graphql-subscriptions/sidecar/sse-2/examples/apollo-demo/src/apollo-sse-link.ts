/**
 * Custom Apollo Link for GraphQL-SSE subscriptions
 * Compatible with SSE-2 implementation
 */

import { ApolloLink, Observable, Operation, NextLink } from '@apollo/client/core';
import type { ExecutionResult } from 'graphql';

export interface SSELinkOptions {
  uri: string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

export class GraphQLSSELink extends ApolloLink {
  private uri: string;
  private headers: Record<string, string>;
  private credentials?: RequestCredentials;

  constructor(options: SSELinkOptions) {
    super();
    this.uri = options.uri;
    this.headers = options.headers || {};
    this.credentials = options.credentials;
  }

  public request(operation: Operation, forward?: NextLink): Observable<ExecutionResult> | null {
    return new Observable((observer) => {
      let abortController: AbortController | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      const cleanup = () => {
        if (abortController) {
          abortController.abort();
        }
        if (reader) {
          reader.cancel().catch(() => {});
        }
      };

      const startSubscription = async () => {
        try {
          abortController = new AbortController();



          const response = await fetch(this.uri, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              ...this.headers,
            },
            credentials: this.credentials,
            body: JSON.stringify({
              query: operation.query.loc?.source.body || '',
              variables: operation.variables || {},
              operationName: operation.operationName,
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            // Handle validation errors
            if (response.status === 400) {
              const errorResponse = await response.json();
              observer.error(new Error(errorResponse.errors?.[0]?.message || 'Bad Request'));
              return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              observer.complete();
              break;
            }

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ') && line.length > 6) {
                try {
                  const dataStr = line.substring(6);
                  const data = JSON.parse(dataStr);

                  // Skip connection establishment messages
                  if (data.data?.message?.includes('Subscription established')) {
                    continue;
                  }

                  observer.next(data);
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', line, parseError);
                }
              } else if (line.startsWith('event: complete')) {
                observer.complete();
                return;
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            // Subscription was cancelled
            observer.complete();
          } else {
            observer.error(error);
          }
        }
      };

      startSubscription();

      // Return cleanup function
      return cleanup;
    });
  }
}

/**
 * Factory function to create the SSE link
 */
export function createGraphQLSSELink(options: SSELinkOptions): GraphQLSSELink {
  return new GraphQLSSELink(options);
}
