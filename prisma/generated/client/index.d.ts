
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model EventCondition
 * イベント配布条件
 */
export type EventCondition = $Result.DefaultSelection<Prisma.$EventConditionPayload>
/**
 * Model EventReferenceUrl
 * イベント参考URL
 */
export type EventReferenceUrl = $Result.DefaultSelection<Prisma.$EventReferenceUrlPayload>
/**
 * Model EventStore
 * イベント開催店舗（中間テーブル）
 */
export type EventStore = $Result.DefaultSelection<Prisma.$EventStorePayload>
/**
 * Model Event
 * イベント
 */
export type Event = $Result.DefaultSelection<Prisma.$EventPayload>
/**
 * Model Vote
 * キャラクター投票
 */
export type Vote = $Result.DefaultSelection<Prisma.$VotePayload>
/**
 * Model VoteCount
 * キャラクター投票集計
 */
export type VoteCount = $Result.DefaultSelection<Prisma.$VoteCountPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more EventConditions
 * const eventConditions = await prisma.eventCondition.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more EventConditions
   * const eventConditions = await prisma.eventCondition.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.eventCondition`: Exposes CRUD operations for the **EventCondition** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more EventConditions
    * const eventConditions = await prisma.eventCondition.findMany()
    * ```
    */
  get eventCondition(): Prisma.EventConditionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.eventReferenceUrl`: Exposes CRUD operations for the **EventReferenceUrl** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more EventReferenceUrls
    * const eventReferenceUrls = await prisma.eventReferenceUrl.findMany()
    * ```
    */
  get eventReferenceUrl(): Prisma.EventReferenceUrlDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.eventStore`: Exposes CRUD operations for the **EventStore** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more EventStores
    * const eventStores = await prisma.eventStore.findMany()
    * ```
    */
  get eventStore(): Prisma.EventStoreDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.event`: Exposes CRUD operations for the **Event** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Events
    * const events = await prisma.event.findMany()
    * ```
    */
  get event(): Prisma.EventDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.vote`: Exposes CRUD operations for the **Vote** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Votes
    * const votes = await prisma.vote.findMany()
    * ```
    */
  get vote(): Prisma.VoteDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.voteCount`: Exposes CRUD operations for the **VoteCount** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more VoteCounts
    * const voteCounts = await prisma.voteCount.findMany()
    * ```
    */
  get voteCount(): Prisma.VoteCountDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.0
   * Query Engine version: 2ba551f319ab1df4bc874a89965d8b3641056773
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    EventCondition: 'EventCondition',
    EventReferenceUrl: 'EventReferenceUrl',
    EventStore: 'EventStore',
    Event: 'Event',
    Vote: 'Vote',
    VoteCount: 'VoteCount'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "eventCondition" | "eventReferenceUrl" | "eventStore" | "event" | "vote" | "voteCount"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      EventCondition: {
        payload: Prisma.$EventConditionPayload<ExtArgs>
        fields: Prisma.EventConditionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EventConditionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EventConditionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          findFirst: {
            args: Prisma.EventConditionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EventConditionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          findMany: {
            args: Prisma.EventConditionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>[]
          }
          create: {
            args: Prisma.EventConditionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          createMany: {
            args: Prisma.EventConditionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.EventConditionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>[]
          }
          delete: {
            args: Prisma.EventConditionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          update: {
            args: Prisma.EventConditionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          deleteMany: {
            args: Prisma.EventConditionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EventConditionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.EventConditionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>[]
          }
          upsert: {
            args: Prisma.EventConditionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventConditionPayload>
          }
          aggregate: {
            args: Prisma.EventConditionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEventCondition>
          }
          groupBy: {
            args: Prisma.EventConditionGroupByArgs<ExtArgs>
            result: $Utils.Optional<EventConditionGroupByOutputType>[]
          }
          count: {
            args: Prisma.EventConditionCountArgs<ExtArgs>
            result: $Utils.Optional<EventConditionCountAggregateOutputType> | number
          }
        }
      }
      EventReferenceUrl: {
        payload: Prisma.$EventReferenceUrlPayload<ExtArgs>
        fields: Prisma.EventReferenceUrlFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EventReferenceUrlFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EventReferenceUrlFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          findFirst: {
            args: Prisma.EventReferenceUrlFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EventReferenceUrlFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          findMany: {
            args: Prisma.EventReferenceUrlFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>[]
          }
          create: {
            args: Prisma.EventReferenceUrlCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          createMany: {
            args: Prisma.EventReferenceUrlCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.EventReferenceUrlCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>[]
          }
          delete: {
            args: Prisma.EventReferenceUrlDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          update: {
            args: Prisma.EventReferenceUrlUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          deleteMany: {
            args: Prisma.EventReferenceUrlDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EventReferenceUrlUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.EventReferenceUrlUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>[]
          }
          upsert: {
            args: Prisma.EventReferenceUrlUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventReferenceUrlPayload>
          }
          aggregate: {
            args: Prisma.EventReferenceUrlAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEventReferenceUrl>
          }
          groupBy: {
            args: Prisma.EventReferenceUrlGroupByArgs<ExtArgs>
            result: $Utils.Optional<EventReferenceUrlGroupByOutputType>[]
          }
          count: {
            args: Prisma.EventReferenceUrlCountArgs<ExtArgs>
            result: $Utils.Optional<EventReferenceUrlCountAggregateOutputType> | number
          }
        }
      }
      EventStore: {
        payload: Prisma.$EventStorePayload<ExtArgs>
        fields: Prisma.EventStoreFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EventStoreFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EventStoreFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          findFirst: {
            args: Prisma.EventStoreFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EventStoreFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          findMany: {
            args: Prisma.EventStoreFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>[]
          }
          create: {
            args: Prisma.EventStoreCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          createMany: {
            args: Prisma.EventStoreCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.EventStoreCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>[]
          }
          delete: {
            args: Prisma.EventStoreDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          update: {
            args: Prisma.EventStoreUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          deleteMany: {
            args: Prisma.EventStoreDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EventStoreUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.EventStoreUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>[]
          }
          upsert: {
            args: Prisma.EventStoreUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventStorePayload>
          }
          aggregate: {
            args: Prisma.EventStoreAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEventStore>
          }
          groupBy: {
            args: Prisma.EventStoreGroupByArgs<ExtArgs>
            result: $Utils.Optional<EventStoreGroupByOutputType>[]
          }
          count: {
            args: Prisma.EventStoreCountArgs<ExtArgs>
            result: $Utils.Optional<EventStoreCountAggregateOutputType> | number
          }
        }
      }
      Event: {
        payload: Prisma.$EventPayload<ExtArgs>
        fields: Prisma.EventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          findFirst: {
            args: Prisma.EventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          findMany: {
            args: Prisma.EventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>[]
          }
          create: {
            args: Prisma.EventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          createMany: {
            args: Prisma.EventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.EventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>[]
          }
          delete: {
            args: Prisma.EventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          update: {
            args: Prisma.EventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          deleteMany: {
            args: Prisma.EventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.EventUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>[]
          }
          upsert: {
            args: Prisma.EventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EventPayload>
          }
          aggregate: {
            args: Prisma.EventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEvent>
          }
          groupBy: {
            args: Prisma.EventGroupByArgs<ExtArgs>
            result: $Utils.Optional<EventGroupByOutputType>[]
          }
          count: {
            args: Prisma.EventCountArgs<ExtArgs>
            result: $Utils.Optional<EventCountAggregateOutputType> | number
          }
        }
      }
      Vote: {
        payload: Prisma.$VotePayload<ExtArgs>
        fields: Prisma.VoteFieldRefs
        operations: {
          findUnique: {
            args: Prisma.VoteFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.VoteFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          findFirst: {
            args: Prisma.VoteFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.VoteFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          findMany: {
            args: Prisma.VoteFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>[]
          }
          create: {
            args: Prisma.VoteCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          createMany: {
            args: Prisma.VoteCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.VoteCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>[]
          }
          delete: {
            args: Prisma.VoteDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          update: {
            args: Prisma.VoteUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          deleteMany: {
            args: Prisma.VoteDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.VoteUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.VoteUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>[]
          }
          upsert: {
            args: Prisma.VoteUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VotePayload>
          }
          aggregate: {
            args: Prisma.VoteAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateVote>
          }
          groupBy: {
            args: Prisma.VoteGroupByArgs<ExtArgs>
            result: $Utils.Optional<VoteGroupByOutputType>[]
          }
          count: {
            args: Prisma.VoteCountArgs<ExtArgs>
            result: $Utils.Optional<VoteCountAggregateOutputType> | number
          }
        }
      }
      VoteCount: {
        payload: Prisma.$VoteCountPayload<ExtArgs>
        fields: Prisma.VoteCountFieldRefs
        operations: {
          findUnique: {
            args: Prisma.VoteCountFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.VoteCountFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          findFirst: {
            args: Prisma.VoteCountFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.VoteCountFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          findMany: {
            args: Prisma.VoteCountFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>[]
          }
          create: {
            args: Prisma.VoteCountCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          createMany: {
            args: Prisma.VoteCountCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.VoteCountCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>[]
          }
          delete: {
            args: Prisma.VoteCountDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          update: {
            args: Prisma.VoteCountUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          deleteMany: {
            args: Prisma.VoteCountDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.VoteCountUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.VoteCountUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>[]
          }
          upsert: {
            args: Prisma.VoteCountUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VoteCountPayload>
          }
          aggregate: {
            args: Prisma.VoteCountAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateVoteCount>
          }
          groupBy: {
            args: Prisma.VoteCountGroupByArgs<ExtArgs>
            result: $Utils.Optional<VoteCountGroupByOutputType>[]
          }
          count: {
            args: Prisma.VoteCountCountArgs<ExtArgs>
            result: $Utils.Optional<VoteCountCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    eventCondition?: EventConditionOmit
    eventReferenceUrl?: EventReferenceUrlOmit
    eventStore?: EventStoreOmit
    event?: EventOmit
    vote?: VoteOmit
    voteCount?: VoteCountOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type EventCountOutputType
   */

  export type EventCountOutputType = {
    conditions: number
    referenceUrls: number
    stores: number
  }

  export type EventCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    conditions?: boolean | EventCountOutputTypeCountConditionsArgs
    referenceUrls?: boolean | EventCountOutputTypeCountReferenceUrlsArgs
    stores?: boolean | EventCountOutputTypeCountStoresArgs
  }

  // Custom InputTypes
  /**
   * EventCountOutputType without action
   */
  export type EventCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCountOutputType
     */
    select?: EventCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * EventCountOutputType without action
   */
  export type EventCountOutputTypeCountConditionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventConditionWhereInput
  }

  /**
   * EventCountOutputType without action
   */
  export type EventCountOutputTypeCountReferenceUrlsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventReferenceUrlWhereInput
  }

  /**
   * EventCountOutputType without action
   */
  export type EventCountOutputTypeCountStoresArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventStoreWhereInput
  }


  /**
   * Models
   */

  /**
   * Model EventCondition
   */

  export type AggregateEventCondition = {
    _count: EventConditionCountAggregateOutputType | null
    _avg: EventConditionAvgAggregateOutputType | null
    _sum: EventConditionSumAggregateOutputType | null
    _min: EventConditionMinAggregateOutputType | null
    _max: EventConditionMaxAggregateOutputType | null
  }

  export type EventConditionAvgAggregateOutputType = {
    purchaseAmount: number | null
    quantity: number | null
  }

  export type EventConditionSumAggregateOutputType = {
    purchaseAmount: number | null
    quantity: number | null
  }

  export type EventConditionMinAggregateOutputType = {
    id: string | null
    eventId: string | null
    type: string | null
    purchaseAmount: number | null
    quantity: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventConditionMaxAggregateOutputType = {
    id: string | null
    eventId: string | null
    type: string | null
    purchaseAmount: number | null
    quantity: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventConditionCountAggregateOutputType = {
    id: number
    eventId: number
    type: number
    purchaseAmount: number
    quantity: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type EventConditionAvgAggregateInputType = {
    purchaseAmount?: true
    quantity?: true
  }

  export type EventConditionSumAggregateInputType = {
    purchaseAmount?: true
    quantity?: true
  }

  export type EventConditionMinAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    purchaseAmount?: true
    quantity?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventConditionMaxAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    purchaseAmount?: true
    quantity?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventConditionCountAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    purchaseAmount?: true
    quantity?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type EventConditionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventCondition to aggregate.
     */
    where?: EventConditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventConditions to fetch.
     */
    orderBy?: EventConditionOrderByWithRelationInput | EventConditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EventConditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventConditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventConditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned EventConditions
    **/
    _count?: true | EventConditionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: EventConditionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: EventConditionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EventConditionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EventConditionMaxAggregateInputType
  }

  export type GetEventConditionAggregateType<T extends EventConditionAggregateArgs> = {
        [P in keyof T & keyof AggregateEventCondition]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEventCondition[P]>
      : GetScalarType<T[P], AggregateEventCondition[P]>
  }




  export type EventConditionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventConditionWhereInput
    orderBy?: EventConditionOrderByWithAggregationInput | EventConditionOrderByWithAggregationInput[]
    by: EventConditionScalarFieldEnum[] | EventConditionScalarFieldEnum
    having?: EventConditionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EventConditionCountAggregateInputType | true
    _avg?: EventConditionAvgAggregateInputType
    _sum?: EventConditionSumAggregateInputType
    _min?: EventConditionMinAggregateInputType
    _max?: EventConditionMaxAggregateInputType
  }

  export type EventConditionGroupByOutputType = {
    id: string
    eventId: string
    type: string
    purchaseAmount: number | null
    quantity: number | null
    createdAt: Date
    updatedAt: Date
    _count: EventConditionCountAggregateOutputType | null
    _avg: EventConditionAvgAggregateOutputType | null
    _sum: EventConditionSumAggregateOutputType | null
    _min: EventConditionMinAggregateOutputType | null
    _max: EventConditionMaxAggregateOutputType | null
  }

  type GetEventConditionGroupByPayload<T extends EventConditionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EventConditionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EventConditionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EventConditionGroupByOutputType[P]>
            : GetScalarType<T[P], EventConditionGroupByOutputType[P]>
        }
      >
    >


  export type EventConditionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    purchaseAmount?: boolean
    quantity?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventCondition"]>

  export type EventConditionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    purchaseAmount?: boolean
    quantity?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventCondition"]>

  export type EventConditionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    purchaseAmount?: boolean
    quantity?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventCondition"]>

  export type EventConditionSelectScalar = {
    id?: boolean
    eventId?: boolean
    type?: boolean
    purchaseAmount?: boolean
    quantity?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type EventConditionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "eventId" | "type" | "purchaseAmount" | "quantity" | "createdAt" | "updatedAt", ExtArgs["result"]["eventCondition"]>
  export type EventConditionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventConditionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventConditionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }

  export type $EventConditionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "EventCondition"
    objects: {
      event: Prisma.$EventPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      eventId: string
      /**
       * 配布条件の種類: purchase, first_come, lottery, everyone
       */
      type: string
      /**
       * 購入条件の場合の金額（円）
       */
      purchaseAmount: number | null
      /**
       * 先着または抽選の人数
       */
      quantity: number | null
      /**
       * 作成日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["eventCondition"]>
    composites: {}
  }

  type EventConditionGetPayload<S extends boolean | null | undefined | EventConditionDefaultArgs> = $Result.GetResult<Prisma.$EventConditionPayload, S>

  type EventConditionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EventConditionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EventConditionCountAggregateInputType | true
    }

  export interface EventConditionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['EventCondition'], meta: { name: 'EventCondition' } }
    /**
     * Find zero or one EventCondition that matches the filter.
     * @param {EventConditionFindUniqueArgs} args - Arguments to find a EventCondition
     * @example
     * // Get one EventCondition
     * const eventCondition = await prisma.eventCondition.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EventConditionFindUniqueArgs>(args: SelectSubset<T, EventConditionFindUniqueArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one EventCondition that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EventConditionFindUniqueOrThrowArgs} args - Arguments to find a EventCondition
     * @example
     * // Get one EventCondition
     * const eventCondition = await prisma.eventCondition.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EventConditionFindUniqueOrThrowArgs>(args: SelectSubset<T, EventConditionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventCondition that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionFindFirstArgs} args - Arguments to find a EventCondition
     * @example
     * // Get one EventCondition
     * const eventCondition = await prisma.eventCondition.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EventConditionFindFirstArgs>(args?: SelectSubset<T, EventConditionFindFirstArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventCondition that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionFindFirstOrThrowArgs} args - Arguments to find a EventCondition
     * @example
     * // Get one EventCondition
     * const eventCondition = await prisma.eventCondition.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EventConditionFindFirstOrThrowArgs>(args?: SelectSubset<T, EventConditionFindFirstOrThrowArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more EventConditions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all EventConditions
     * const eventConditions = await prisma.eventCondition.findMany()
     * 
     * // Get first 10 EventConditions
     * const eventConditions = await prisma.eventCondition.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const eventConditionWithIdOnly = await prisma.eventCondition.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EventConditionFindManyArgs>(args?: SelectSubset<T, EventConditionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a EventCondition.
     * @param {EventConditionCreateArgs} args - Arguments to create a EventCondition.
     * @example
     * // Create one EventCondition
     * const EventCondition = await prisma.eventCondition.create({
     *   data: {
     *     // ... data to create a EventCondition
     *   }
     * })
     * 
     */
    create<T extends EventConditionCreateArgs>(args: SelectSubset<T, EventConditionCreateArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many EventConditions.
     * @param {EventConditionCreateManyArgs} args - Arguments to create many EventConditions.
     * @example
     * // Create many EventConditions
     * const eventCondition = await prisma.eventCondition.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EventConditionCreateManyArgs>(args?: SelectSubset<T, EventConditionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many EventConditions and returns the data saved in the database.
     * @param {EventConditionCreateManyAndReturnArgs} args - Arguments to create many EventConditions.
     * @example
     * // Create many EventConditions
     * const eventCondition = await prisma.eventCondition.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many EventConditions and only return the `id`
     * const eventConditionWithIdOnly = await prisma.eventCondition.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends EventConditionCreateManyAndReturnArgs>(args?: SelectSubset<T, EventConditionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a EventCondition.
     * @param {EventConditionDeleteArgs} args - Arguments to delete one EventCondition.
     * @example
     * // Delete one EventCondition
     * const EventCondition = await prisma.eventCondition.delete({
     *   where: {
     *     // ... filter to delete one EventCondition
     *   }
     * })
     * 
     */
    delete<T extends EventConditionDeleteArgs>(args: SelectSubset<T, EventConditionDeleteArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one EventCondition.
     * @param {EventConditionUpdateArgs} args - Arguments to update one EventCondition.
     * @example
     * // Update one EventCondition
     * const eventCondition = await prisma.eventCondition.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EventConditionUpdateArgs>(args: SelectSubset<T, EventConditionUpdateArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more EventConditions.
     * @param {EventConditionDeleteManyArgs} args - Arguments to filter EventConditions to delete.
     * @example
     * // Delete a few EventConditions
     * const { count } = await prisma.eventCondition.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EventConditionDeleteManyArgs>(args?: SelectSubset<T, EventConditionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventConditions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many EventConditions
     * const eventCondition = await prisma.eventCondition.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EventConditionUpdateManyArgs>(args: SelectSubset<T, EventConditionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventConditions and returns the data updated in the database.
     * @param {EventConditionUpdateManyAndReturnArgs} args - Arguments to update many EventConditions.
     * @example
     * // Update many EventConditions
     * const eventCondition = await prisma.eventCondition.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more EventConditions and only return the `id`
     * const eventConditionWithIdOnly = await prisma.eventCondition.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends EventConditionUpdateManyAndReturnArgs>(args: SelectSubset<T, EventConditionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one EventCondition.
     * @param {EventConditionUpsertArgs} args - Arguments to update or create a EventCondition.
     * @example
     * // Update or create a EventCondition
     * const eventCondition = await prisma.eventCondition.upsert({
     *   create: {
     *     // ... data to create a EventCondition
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the EventCondition we want to update
     *   }
     * })
     */
    upsert<T extends EventConditionUpsertArgs>(args: SelectSubset<T, EventConditionUpsertArgs<ExtArgs>>): Prisma__EventConditionClient<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of EventConditions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionCountArgs} args - Arguments to filter EventConditions to count.
     * @example
     * // Count the number of EventConditions
     * const count = await prisma.eventCondition.count({
     *   where: {
     *     // ... the filter for the EventConditions we want to count
     *   }
     * })
    **/
    count<T extends EventConditionCountArgs>(
      args?: Subset<T, EventConditionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EventConditionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a EventCondition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EventConditionAggregateArgs>(args: Subset<T, EventConditionAggregateArgs>): Prisma.PrismaPromise<GetEventConditionAggregateType<T>>

    /**
     * Group by EventCondition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventConditionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EventConditionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EventConditionGroupByArgs['orderBy'] }
        : { orderBy?: EventConditionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EventConditionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEventConditionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the EventCondition model
   */
  readonly fields: EventConditionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for EventCondition.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EventConditionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    event<T extends EventDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EventDefaultArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the EventCondition model
   */
  interface EventConditionFieldRefs {
    readonly id: FieldRef<"EventCondition", 'String'>
    readonly eventId: FieldRef<"EventCondition", 'String'>
    readonly type: FieldRef<"EventCondition", 'String'>
    readonly purchaseAmount: FieldRef<"EventCondition", 'Int'>
    readonly quantity: FieldRef<"EventCondition", 'Int'>
    readonly createdAt: FieldRef<"EventCondition", 'DateTime'>
    readonly updatedAt: FieldRef<"EventCondition", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * EventCondition findUnique
   */
  export type EventConditionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter, which EventCondition to fetch.
     */
    where: EventConditionWhereUniqueInput
  }

  /**
   * EventCondition findUniqueOrThrow
   */
  export type EventConditionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter, which EventCondition to fetch.
     */
    where: EventConditionWhereUniqueInput
  }

  /**
   * EventCondition findFirst
   */
  export type EventConditionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter, which EventCondition to fetch.
     */
    where?: EventConditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventConditions to fetch.
     */
    orderBy?: EventConditionOrderByWithRelationInput | EventConditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventConditions.
     */
    cursor?: EventConditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventConditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventConditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventConditions.
     */
    distinct?: EventConditionScalarFieldEnum | EventConditionScalarFieldEnum[]
  }

  /**
   * EventCondition findFirstOrThrow
   */
  export type EventConditionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter, which EventCondition to fetch.
     */
    where?: EventConditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventConditions to fetch.
     */
    orderBy?: EventConditionOrderByWithRelationInput | EventConditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventConditions.
     */
    cursor?: EventConditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventConditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventConditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventConditions.
     */
    distinct?: EventConditionScalarFieldEnum | EventConditionScalarFieldEnum[]
  }

  /**
   * EventCondition findMany
   */
  export type EventConditionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter, which EventConditions to fetch.
     */
    where?: EventConditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventConditions to fetch.
     */
    orderBy?: EventConditionOrderByWithRelationInput | EventConditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing EventConditions.
     */
    cursor?: EventConditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventConditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventConditions.
     */
    skip?: number
    distinct?: EventConditionScalarFieldEnum | EventConditionScalarFieldEnum[]
  }

  /**
   * EventCondition create
   */
  export type EventConditionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * The data needed to create a EventCondition.
     */
    data: XOR<EventConditionCreateInput, EventConditionUncheckedCreateInput>
  }

  /**
   * EventCondition createMany
   */
  export type EventConditionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many EventConditions.
     */
    data: EventConditionCreateManyInput | EventConditionCreateManyInput[]
  }

  /**
   * EventCondition createManyAndReturn
   */
  export type EventConditionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * The data used to create many EventConditions.
     */
    data: EventConditionCreateManyInput | EventConditionCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventCondition update
   */
  export type EventConditionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * The data needed to update a EventCondition.
     */
    data: XOR<EventConditionUpdateInput, EventConditionUncheckedUpdateInput>
    /**
     * Choose, which EventCondition to update.
     */
    where: EventConditionWhereUniqueInput
  }

  /**
   * EventCondition updateMany
   */
  export type EventConditionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update EventConditions.
     */
    data: XOR<EventConditionUpdateManyMutationInput, EventConditionUncheckedUpdateManyInput>
    /**
     * Filter which EventConditions to update
     */
    where?: EventConditionWhereInput
    /**
     * Limit how many EventConditions to update.
     */
    limit?: number
  }

  /**
   * EventCondition updateManyAndReturn
   */
  export type EventConditionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * The data used to update EventConditions.
     */
    data: XOR<EventConditionUpdateManyMutationInput, EventConditionUncheckedUpdateManyInput>
    /**
     * Filter which EventConditions to update
     */
    where?: EventConditionWhereInput
    /**
     * Limit how many EventConditions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventCondition upsert
   */
  export type EventConditionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * The filter to search for the EventCondition to update in case it exists.
     */
    where: EventConditionWhereUniqueInput
    /**
     * In case the EventCondition found by the `where` argument doesn't exist, create a new EventCondition with this data.
     */
    create: XOR<EventConditionCreateInput, EventConditionUncheckedCreateInput>
    /**
     * In case the EventCondition was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EventConditionUpdateInput, EventConditionUncheckedUpdateInput>
  }

  /**
   * EventCondition delete
   */
  export type EventConditionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    /**
     * Filter which EventCondition to delete.
     */
    where: EventConditionWhereUniqueInput
  }

  /**
   * EventCondition deleteMany
   */
  export type EventConditionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventConditions to delete
     */
    where?: EventConditionWhereInput
    /**
     * Limit how many EventConditions to delete.
     */
    limit?: number
  }

  /**
   * EventCondition without action
   */
  export type EventConditionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
  }


  /**
   * Model EventReferenceUrl
   */

  export type AggregateEventReferenceUrl = {
    _count: EventReferenceUrlCountAggregateOutputType | null
    _min: EventReferenceUrlMinAggregateOutputType | null
    _max: EventReferenceUrlMaxAggregateOutputType | null
  }

  export type EventReferenceUrlMinAggregateOutputType = {
    id: string | null
    eventId: string | null
    type: string | null
    url: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventReferenceUrlMaxAggregateOutputType = {
    id: string | null
    eventId: string | null
    type: string | null
    url: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventReferenceUrlCountAggregateOutputType = {
    id: number
    eventId: number
    type: number
    url: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type EventReferenceUrlMinAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    url?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventReferenceUrlMaxAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    url?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventReferenceUrlCountAggregateInputType = {
    id?: true
    eventId?: true
    type?: true
    url?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type EventReferenceUrlAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventReferenceUrl to aggregate.
     */
    where?: EventReferenceUrlWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventReferenceUrls to fetch.
     */
    orderBy?: EventReferenceUrlOrderByWithRelationInput | EventReferenceUrlOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EventReferenceUrlWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventReferenceUrls from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventReferenceUrls.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned EventReferenceUrls
    **/
    _count?: true | EventReferenceUrlCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EventReferenceUrlMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EventReferenceUrlMaxAggregateInputType
  }

  export type GetEventReferenceUrlAggregateType<T extends EventReferenceUrlAggregateArgs> = {
        [P in keyof T & keyof AggregateEventReferenceUrl]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEventReferenceUrl[P]>
      : GetScalarType<T[P], AggregateEventReferenceUrl[P]>
  }




  export type EventReferenceUrlGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventReferenceUrlWhereInput
    orderBy?: EventReferenceUrlOrderByWithAggregationInput | EventReferenceUrlOrderByWithAggregationInput[]
    by: EventReferenceUrlScalarFieldEnum[] | EventReferenceUrlScalarFieldEnum
    having?: EventReferenceUrlScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EventReferenceUrlCountAggregateInputType | true
    _min?: EventReferenceUrlMinAggregateInputType
    _max?: EventReferenceUrlMaxAggregateInputType
  }

  export type EventReferenceUrlGroupByOutputType = {
    id: string
    eventId: string
    type: string
    url: string
    createdAt: Date
    updatedAt: Date
    _count: EventReferenceUrlCountAggregateOutputType | null
    _min: EventReferenceUrlMinAggregateOutputType | null
    _max: EventReferenceUrlMaxAggregateOutputType | null
  }

  type GetEventReferenceUrlGroupByPayload<T extends EventReferenceUrlGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EventReferenceUrlGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EventReferenceUrlGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EventReferenceUrlGroupByOutputType[P]>
            : GetScalarType<T[P], EventReferenceUrlGroupByOutputType[P]>
        }
      >
    >


  export type EventReferenceUrlSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    url?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventReferenceUrl"]>

  export type EventReferenceUrlSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    url?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventReferenceUrl"]>

  export type EventReferenceUrlSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    type?: boolean
    url?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventReferenceUrl"]>

  export type EventReferenceUrlSelectScalar = {
    id?: boolean
    eventId?: boolean
    type?: boolean
    url?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type EventReferenceUrlOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "eventId" | "type" | "url" | "createdAt" | "updatedAt", ExtArgs["result"]["eventReferenceUrl"]>
  export type EventReferenceUrlInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventReferenceUrlIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventReferenceUrlIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }

  export type $EventReferenceUrlPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "EventReferenceUrl"
    objects: {
      event: Prisma.$EventPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      eventId: string
      /**
       * URLの種類: announce, start, end
       */
      type: string
      url: string
      /**
       * 作成日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["eventReferenceUrl"]>
    composites: {}
  }

  type EventReferenceUrlGetPayload<S extends boolean | null | undefined | EventReferenceUrlDefaultArgs> = $Result.GetResult<Prisma.$EventReferenceUrlPayload, S>

  type EventReferenceUrlCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EventReferenceUrlFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EventReferenceUrlCountAggregateInputType | true
    }

  export interface EventReferenceUrlDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['EventReferenceUrl'], meta: { name: 'EventReferenceUrl' } }
    /**
     * Find zero or one EventReferenceUrl that matches the filter.
     * @param {EventReferenceUrlFindUniqueArgs} args - Arguments to find a EventReferenceUrl
     * @example
     * // Get one EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EventReferenceUrlFindUniqueArgs>(args: SelectSubset<T, EventReferenceUrlFindUniqueArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one EventReferenceUrl that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EventReferenceUrlFindUniqueOrThrowArgs} args - Arguments to find a EventReferenceUrl
     * @example
     * // Get one EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EventReferenceUrlFindUniqueOrThrowArgs>(args: SelectSubset<T, EventReferenceUrlFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventReferenceUrl that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlFindFirstArgs} args - Arguments to find a EventReferenceUrl
     * @example
     * // Get one EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EventReferenceUrlFindFirstArgs>(args?: SelectSubset<T, EventReferenceUrlFindFirstArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventReferenceUrl that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlFindFirstOrThrowArgs} args - Arguments to find a EventReferenceUrl
     * @example
     * // Get one EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EventReferenceUrlFindFirstOrThrowArgs>(args?: SelectSubset<T, EventReferenceUrlFindFirstOrThrowArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more EventReferenceUrls that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all EventReferenceUrls
     * const eventReferenceUrls = await prisma.eventReferenceUrl.findMany()
     * 
     * // Get first 10 EventReferenceUrls
     * const eventReferenceUrls = await prisma.eventReferenceUrl.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const eventReferenceUrlWithIdOnly = await prisma.eventReferenceUrl.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EventReferenceUrlFindManyArgs>(args?: SelectSubset<T, EventReferenceUrlFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a EventReferenceUrl.
     * @param {EventReferenceUrlCreateArgs} args - Arguments to create a EventReferenceUrl.
     * @example
     * // Create one EventReferenceUrl
     * const EventReferenceUrl = await prisma.eventReferenceUrl.create({
     *   data: {
     *     // ... data to create a EventReferenceUrl
     *   }
     * })
     * 
     */
    create<T extends EventReferenceUrlCreateArgs>(args: SelectSubset<T, EventReferenceUrlCreateArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many EventReferenceUrls.
     * @param {EventReferenceUrlCreateManyArgs} args - Arguments to create many EventReferenceUrls.
     * @example
     * // Create many EventReferenceUrls
     * const eventReferenceUrl = await prisma.eventReferenceUrl.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EventReferenceUrlCreateManyArgs>(args?: SelectSubset<T, EventReferenceUrlCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many EventReferenceUrls and returns the data saved in the database.
     * @param {EventReferenceUrlCreateManyAndReturnArgs} args - Arguments to create many EventReferenceUrls.
     * @example
     * // Create many EventReferenceUrls
     * const eventReferenceUrl = await prisma.eventReferenceUrl.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many EventReferenceUrls and only return the `id`
     * const eventReferenceUrlWithIdOnly = await prisma.eventReferenceUrl.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends EventReferenceUrlCreateManyAndReturnArgs>(args?: SelectSubset<T, EventReferenceUrlCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a EventReferenceUrl.
     * @param {EventReferenceUrlDeleteArgs} args - Arguments to delete one EventReferenceUrl.
     * @example
     * // Delete one EventReferenceUrl
     * const EventReferenceUrl = await prisma.eventReferenceUrl.delete({
     *   where: {
     *     // ... filter to delete one EventReferenceUrl
     *   }
     * })
     * 
     */
    delete<T extends EventReferenceUrlDeleteArgs>(args: SelectSubset<T, EventReferenceUrlDeleteArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one EventReferenceUrl.
     * @param {EventReferenceUrlUpdateArgs} args - Arguments to update one EventReferenceUrl.
     * @example
     * // Update one EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EventReferenceUrlUpdateArgs>(args: SelectSubset<T, EventReferenceUrlUpdateArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more EventReferenceUrls.
     * @param {EventReferenceUrlDeleteManyArgs} args - Arguments to filter EventReferenceUrls to delete.
     * @example
     * // Delete a few EventReferenceUrls
     * const { count } = await prisma.eventReferenceUrl.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EventReferenceUrlDeleteManyArgs>(args?: SelectSubset<T, EventReferenceUrlDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventReferenceUrls.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many EventReferenceUrls
     * const eventReferenceUrl = await prisma.eventReferenceUrl.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EventReferenceUrlUpdateManyArgs>(args: SelectSubset<T, EventReferenceUrlUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventReferenceUrls and returns the data updated in the database.
     * @param {EventReferenceUrlUpdateManyAndReturnArgs} args - Arguments to update many EventReferenceUrls.
     * @example
     * // Update many EventReferenceUrls
     * const eventReferenceUrl = await prisma.eventReferenceUrl.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more EventReferenceUrls and only return the `id`
     * const eventReferenceUrlWithIdOnly = await prisma.eventReferenceUrl.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends EventReferenceUrlUpdateManyAndReturnArgs>(args: SelectSubset<T, EventReferenceUrlUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one EventReferenceUrl.
     * @param {EventReferenceUrlUpsertArgs} args - Arguments to update or create a EventReferenceUrl.
     * @example
     * // Update or create a EventReferenceUrl
     * const eventReferenceUrl = await prisma.eventReferenceUrl.upsert({
     *   create: {
     *     // ... data to create a EventReferenceUrl
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the EventReferenceUrl we want to update
     *   }
     * })
     */
    upsert<T extends EventReferenceUrlUpsertArgs>(args: SelectSubset<T, EventReferenceUrlUpsertArgs<ExtArgs>>): Prisma__EventReferenceUrlClient<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of EventReferenceUrls.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlCountArgs} args - Arguments to filter EventReferenceUrls to count.
     * @example
     * // Count the number of EventReferenceUrls
     * const count = await prisma.eventReferenceUrl.count({
     *   where: {
     *     // ... the filter for the EventReferenceUrls we want to count
     *   }
     * })
    **/
    count<T extends EventReferenceUrlCountArgs>(
      args?: Subset<T, EventReferenceUrlCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EventReferenceUrlCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a EventReferenceUrl.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EventReferenceUrlAggregateArgs>(args: Subset<T, EventReferenceUrlAggregateArgs>): Prisma.PrismaPromise<GetEventReferenceUrlAggregateType<T>>

    /**
     * Group by EventReferenceUrl.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventReferenceUrlGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EventReferenceUrlGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EventReferenceUrlGroupByArgs['orderBy'] }
        : { orderBy?: EventReferenceUrlGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EventReferenceUrlGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEventReferenceUrlGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the EventReferenceUrl model
   */
  readonly fields: EventReferenceUrlFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for EventReferenceUrl.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EventReferenceUrlClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    event<T extends EventDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EventDefaultArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the EventReferenceUrl model
   */
  interface EventReferenceUrlFieldRefs {
    readonly id: FieldRef<"EventReferenceUrl", 'String'>
    readonly eventId: FieldRef<"EventReferenceUrl", 'String'>
    readonly type: FieldRef<"EventReferenceUrl", 'String'>
    readonly url: FieldRef<"EventReferenceUrl", 'String'>
    readonly createdAt: FieldRef<"EventReferenceUrl", 'DateTime'>
    readonly updatedAt: FieldRef<"EventReferenceUrl", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * EventReferenceUrl findUnique
   */
  export type EventReferenceUrlFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter, which EventReferenceUrl to fetch.
     */
    where: EventReferenceUrlWhereUniqueInput
  }

  /**
   * EventReferenceUrl findUniqueOrThrow
   */
  export type EventReferenceUrlFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter, which EventReferenceUrl to fetch.
     */
    where: EventReferenceUrlWhereUniqueInput
  }

  /**
   * EventReferenceUrl findFirst
   */
  export type EventReferenceUrlFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter, which EventReferenceUrl to fetch.
     */
    where?: EventReferenceUrlWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventReferenceUrls to fetch.
     */
    orderBy?: EventReferenceUrlOrderByWithRelationInput | EventReferenceUrlOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventReferenceUrls.
     */
    cursor?: EventReferenceUrlWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventReferenceUrls from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventReferenceUrls.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventReferenceUrls.
     */
    distinct?: EventReferenceUrlScalarFieldEnum | EventReferenceUrlScalarFieldEnum[]
  }

  /**
   * EventReferenceUrl findFirstOrThrow
   */
  export type EventReferenceUrlFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter, which EventReferenceUrl to fetch.
     */
    where?: EventReferenceUrlWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventReferenceUrls to fetch.
     */
    orderBy?: EventReferenceUrlOrderByWithRelationInput | EventReferenceUrlOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventReferenceUrls.
     */
    cursor?: EventReferenceUrlWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventReferenceUrls from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventReferenceUrls.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventReferenceUrls.
     */
    distinct?: EventReferenceUrlScalarFieldEnum | EventReferenceUrlScalarFieldEnum[]
  }

  /**
   * EventReferenceUrl findMany
   */
  export type EventReferenceUrlFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter, which EventReferenceUrls to fetch.
     */
    where?: EventReferenceUrlWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventReferenceUrls to fetch.
     */
    orderBy?: EventReferenceUrlOrderByWithRelationInput | EventReferenceUrlOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing EventReferenceUrls.
     */
    cursor?: EventReferenceUrlWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventReferenceUrls from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventReferenceUrls.
     */
    skip?: number
    distinct?: EventReferenceUrlScalarFieldEnum | EventReferenceUrlScalarFieldEnum[]
  }

  /**
   * EventReferenceUrl create
   */
  export type EventReferenceUrlCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * The data needed to create a EventReferenceUrl.
     */
    data: XOR<EventReferenceUrlCreateInput, EventReferenceUrlUncheckedCreateInput>
  }

  /**
   * EventReferenceUrl createMany
   */
  export type EventReferenceUrlCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many EventReferenceUrls.
     */
    data: EventReferenceUrlCreateManyInput | EventReferenceUrlCreateManyInput[]
  }

  /**
   * EventReferenceUrl createManyAndReturn
   */
  export type EventReferenceUrlCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * The data used to create many EventReferenceUrls.
     */
    data: EventReferenceUrlCreateManyInput | EventReferenceUrlCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventReferenceUrl update
   */
  export type EventReferenceUrlUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * The data needed to update a EventReferenceUrl.
     */
    data: XOR<EventReferenceUrlUpdateInput, EventReferenceUrlUncheckedUpdateInput>
    /**
     * Choose, which EventReferenceUrl to update.
     */
    where: EventReferenceUrlWhereUniqueInput
  }

  /**
   * EventReferenceUrl updateMany
   */
  export type EventReferenceUrlUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update EventReferenceUrls.
     */
    data: XOR<EventReferenceUrlUpdateManyMutationInput, EventReferenceUrlUncheckedUpdateManyInput>
    /**
     * Filter which EventReferenceUrls to update
     */
    where?: EventReferenceUrlWhereInput
    /**
     * Limit how many EventReferenceUrls to update.
     */
    limit?: number
  }

  /**
   * EventReferenceUrl updateManyAndReturn
   */
  export type EventReferenceUrlUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * The data used to update EventReferenceUrls.
     */
    data: XOR<EventReferenceUrlUpdateManyMutationInput, EventReferenceUrlUncheckedUpdateManyInput>
    /**
     * Filter which EventReferenceUrls to update
     */
    where?: EventReferenceUrlWhereInput
    /**
     * Limit how many EventReferenceUrls to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventReferenceUrl upsert
   */
  export type EventReferenceUrlUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * The filter to search for the EventReferenceUrl to update in case it exists.
     */
    where: EventReferenceUrlWhereUniqueInput
    /**
     * In case the EventReferenceUrl found by the `where` argument doesn't exist, create a new EventReferenceUrl with this data.
     */
    create: XOR<EventReferenceUrlCreateInput, EventReferenceUrlUncheckedCreateInput>
    /**
     * In case the EventReferenceUrl was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EventReferenceUrlUpdateInput, EventReferenceUrlUncheckedUpdateInput>
  }

  /**
   * EventReferenceUrl delete
   */
  export type EventReferenceUrlDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    /**
     * Filter which EventReferenceUrl to delete.
     */
    where: EventReferenceUrlWhereUniqueInput
  }

  /**
   * EventReferenceUrl deleteMany
   */
  export type EventReferenceUrlDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventReferenceUrls to delete
     */
    where?: EventReferenceUrlWhereInput
    /**
     * Limit how many EventReferenceUrls to delete.
     */
    limit?: number
  }

  /**
   * EventReferenceUrl without action
   */
  export type EventReferenceUrlDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
  }


  /**
   * Model EventStore
   */

  export type AggregateEventStore = {
    _count: EventStoreCountAggregateOutputType | null
    _min: EventStoreMinAggregateOutputType | null
    _max: EventStoreMaxAggregateOutputType | null
  }

  export type EventStoreMinAggregateOutputType = {
    id: string | null
    eventId: string | null
    storeKey: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventStoreMaxAggregateOutputType = {
    id: string | null
    eventId: string | null
    storeKey: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventStoreCountAggregateOutputType = {
    id: number
    eventId: number
    storeKey: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type EventStoreMinAggregateInputType = {
    id?: true
    eventId?: true
    storeKey?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventStoreMaxAggregateInputType = {
    id?: true
    eventId?: true
    storeKey?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventStoreCountAggregateInputType = {
    id?: true
    eventId?: true
    storeKey?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type EventStoreAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventStore to aggregate.
     */
    where?: EventStoreWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventStores to fetch.
     */
    orderBy?: EventStoreOrderByWithRelationInput | EventStoreOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EventStoreWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventStores from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventStores.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned EventStores
    **/
    _count?: true | EventStoreCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EventStoreMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EventStoreMaxAggregateInputType
  }

  export type GetEventStoreAggregateType<T extends EventStoreAggregateArgs> = {
        [P in keyof T & keyof AggregateEventStore]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEventStore[P]>
      : GetScalarType<T[P], AggregateEventStore[P]>
  }




  export type EventStoreGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventStoreWhereInput
    orderBy?: EventStoreOrderByWithAggregationInput | EventStoreOrderByWithAggregationInput[]
    by: EventStoreScalarFieldEnum[] | EventStoreScalarFieldEnum
    having?: EventStoreScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EventStoreCountAggregateInputType | true
    _min?: EventStoreMinAggregateInputType
    _max?: EventStoreMaxAggregateInputType
  }

  export type EventStoreGroupByOutputType = {
    id: string
    eventId: string
    storeKey: string
    createdAt: Date
    updatedAt: Date
    _count: EventStoreCountAggregateOutputType | null
    _min: EventStoreMinAggregateOutputType | null
    _max: EventStoreMaxAggregateOutputType | null
  }

  type GetEventStoreGroupByPayload<T extends EventStoreGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EventStoreGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EventStoreGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EventStoreGroupByOutputType[P]>
            : GetScalarType<T[P], EventStoreGroupByOutputType[P]>
        }
      >
    >


  export type EventStoreSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    storeKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventStore"]>

  export type EventStoreSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    storeKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventStore"]>

  export type EventStoreSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    eventId?: boolean
    storeKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    event?: boolean | EventDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["eventStore"]>

  export type EventStoreSelectScalar = {
    id?: boolean
    eventId?: boolean
    storeKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type EventStoreOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "eventId" | "storeKey" | "createdAt" | "updatedAt", ExtArgs["result"]["eventStore"]>
  export type EventStoreInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventStoreIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }
  export type EventStoreIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    event?: boolean | EventDefaultArgs<ExtArgs>
  }

  export type $EventStorePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "EventStore"
    objects: {
      event: Prisma.$EventPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      eventId: string
      storeKey: string
      /**
       * 作成日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["eventStore"]>
    composites: {}
  }

  type EventStoreGetPayload<S extends boolean | null | undefined | EventStoreDefaultArgs> = $Result.GetResult<Prisma.$EventStorePayload, S>

  type EventStoreCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EventStoreFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EventStoreCountAggregateInputType | true
    }

  export interface EventStoreDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['EventStore'], meta: { name: 'EventStore' } }
    /**
     * Find zero or one EventStore that matches the filter.
     * @param {EventStoreFindUniqueArgs} args - Arguments to find a EventStore
     * @example
     * // Get one EventStore
     * const eventStore = await prisma.eventStore.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EventStoreFindUniqueArgs>(args: SelectSubset<T, EventStoreFindUniqueArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one EventStore that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EventStoreFindUniqueOrThrowArgs} args - Arguments to find a EventStore
     * @example
     * // Get one EventStore
     * const eventStore = await prisma.eventStore.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EventStoreFindUniqueOrThrowArgs>(args: SelectSubset<T, EventStoreFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventStore that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreFindFirstArgs} args - Arguments to find a EventStore
     * @example
     * // Get one EventStore
     * const eventStore = await prisma.eventStore.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EventStoreFindFirstArgs>(args?: SelectSubset<T, EventStoreFindFirstArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EventStore that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreFindFirstOrThrowArgs} args - Arguments to find a EventStore
     * @example
     * // Get one EventStore
     * const eventStore = await prisma.eventStore.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EventStoreFindFirstOrThrowArgs>(args?: SelectSubset<T, EventStoreFindFirstOrThrowArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more EventStores that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all EventStores
     * const eventStores = await prisma.eventStore.findMany()
     * 
     * // Get first 10 EventStores
     * const eventStores = await prisma.eventStore.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const eventStoreWithIdOnly = await prisma.eventStore.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EventStoreFindManyArgs>(args?: SelectSubset<T, EventStoreFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a EventStore.
     * @param {EventStoreCreateArgs} args - Arguments to create a EventStore.
     * @example
     * // Create one EventStore
     * const EventStore = await prisma.eventStore.create({
     *   data: {
     *     // ... data to create a EventStore
     *   }
     * })
     * 
     */
    create<T extends EventStoreCreateArgs>(args: SelectSubset<T, EventStoreCreateArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many EventStores.
     * @param {EventStoreCreateManyArgs} args - Arguments to create many EventStores.
     * @example
     * // Create many EventStores
     * const eventStore = await prisma.eventStore.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EventStoreCreateManyArgs>(args?: SelectSubset<T, EventStoreCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many EventStores and returns the data saved in the database.
     * @param {EventStoreCreateManyAndReturnArgs} args - Arguments to create many EventStores.
     * @example
     * // Create many EventStores
     * const eventStore = await prisma.eventStore.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many EventStores and only return the `id`
     * const eventStoreWithIdOnly = await prisma.eventStore.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends EventStoreCreateManyAndReturnArgs>(args?: SelectSubset<T, EventStoreCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a EventStore.
     * @param {EventStoreDeleteArgs} args - Arguments to delete one EventStore.
     * @example
     * // Delete one EventStore
     * const EventStore = await prisma.eventStore.delete({
     *   where: {
     *     // ... filter to delete one EventStore
     *   }
     * })
     * 
     */
    delete<T extends EventStoreDeleteArgs>(args: SelectSubset<T, EventStoreDeleteArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one EventStore.
     * @param {EventStoreUpdateArgs} args - Arguments to update one EventStore.
     * @example
     * // Update one EventStore
     * const eventStore = await prisma.eventStore.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EventStoreUpdateArgs>(args: SelectSubset<T, EventStoreUpdateArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more EventStores.
     * @param {EventStoreDeleteManyArgs} args - Arguments to filter EventStores to delete.
     * @example
     * // Delete a few EventStores
     * const { count } = await prisma.eventStore.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EventStoreDeleteManyArgs>(args?: SelectSubset<T, EventStoreDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventStores.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many EventStores
     * const eventStore = await prisma.eventStore.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EventStoreUpdateManyArgs>(args: SelectSubset<T, EventStoreUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EventStores and returns the data updated in the database.
     * @param {EventStoreUpdateManyAndReturnArgs} args - Arguments to update many EventStores.
     * @example
     * // Update many EventStores
     * const eventStore = await prisma.eventStore.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more EventStores and only return the `id`
     * const eventStoreWithIdOnly = await prisma.eventStore.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends EventStoreUpdateManyAndReturnArgs>(args: SelectSubset<T, EventStoreUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one EventStore.
     * @param {EventStoreUpsertArgs} args - Arguments to update or create a EventStore.
     * @example
     * // Update or create a EventStore
     * const eventStore = await prisma.eventStore.upsert({
     *   create: {
     *     // ... data to create a EventStore
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the EventStore we want to update
     *   }
     * })
     */
    upsert<T extends EventStoreUpsertArgs>(args: SelectSubset<T, EventStoreUpsertArgs<ExtArgs>>): Prisma__EventStoreClient<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of EventStores.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreCountArgs} args - Arguments to filter EventStores to count.
     * @example
     * // Count the number of EventStores
     * const count = await prisma.eventStore.count({
     *   where: {
     *     // ... the filter for the EventStores we want to count
     *   }
     * })
    **/
    count<T extends EventStoreCountArgs>(
      args?: Subset<T, EventStoreCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EventStoreCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a EventStore.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EventStoreAggregateArgs>(args: Subset<T, EventStoreAggregateArgs>): Prisma.PrismaPromise<GetEventStoreAggregateType<T>>

    /**
     * Group by EventStore.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventStoreGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EventStoreGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EventStoreGroupByArgs['orderBy'] }
        : { orderBy?: EventStoreGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EventStoreGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEventStoreGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the EventStore model
   */
  readonly fields: EventStoreFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for EventStore.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EventStoreClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    event<T extends EventDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EventDefaultArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the EventStore model
   */
  interface EventStoreFieldRefs {
    readonly id: FieldRef<"EventStore", 'String'>
    readonly eventId: FieldRef<"EventStore", 'String'>
    readonly storeKey: FieldRef<"EventStore", 'String'>
    readonly createdAt: FieldRef<"EventStore", 'DateTime'>
    readonly updatedAt: FieldRef<"EventStore", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * EventStore findUnique
   */
  export type EventStoreFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter, which EventStore to fetch.
     */
    where: EventStoreWhereUniqueInput
  }

  /**
   * EventStore findUniqueOrThrow
   */
  export type EventStoreFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter, which EventStore to fetch.
     */
    where: EventStoreWhereUniqueInput
  }

  /**
   * EventStore findFirst
   */
  export type EventStoreFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter, which EventStore to fetch.
     */
    where?: EventStoreWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventStores to fetch.
     */
    orderBy?: EventStoreOrderByWithRelationInput | EventStoreOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventStores.
     */
    cursor?: EventStoreWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventStores from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventStores.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventStores.
     */
    distinct?: EventStoreScalarFieldEnum | EventStoreScalarFieldEnum[]
  }

  /**
   * EventStore findFirstOrThrow
   */
  export type EventStoreFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter, which EventStore to fetch.
     */
    where?: EventStoreWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventStores to fetch.
     */
    orderBy?: EventStoreOrderByWithRelationInput | EventStoreOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EventStores.
     */
    cursor?: EventStoreWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventStores from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventStores.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EventStores.
     */
    distinct?: EventStoreScalarFieldEnum | EventStoreScalarFieldEnum[]
  }

  /**
   * EventStore findMany
   */
  export type EventStoreFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter, which EventStores to fetch.
     */
    where?: EventStoreWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EventStores to fetch.
     */
    orderBy?: EventStoreOrderByWithRelationInput | EventStoreOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing EventStores.
     */
    cursor?: EventStoreWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EventStores from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EventStores.
     */
    skip?: number
    distinct?: EventStoreScalarFieldEnum | EventStoreScalarFieldEnum[]
  }

  /**
   * EventStore create
   */
  export type EventStoreCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * The data needed to create a EventStore.
     */
    data: XOR<EventStoreCreateInput, EventStoreUncheckedCreateInput>
  }

  /**
   * EventStore createMany
   */
  export type EventStoreCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many EventStores.
     */
    data: EventStoreCreateManyInput | EventStoreCreateManyInput[]
  }

  /**
   * EventStore createManyAndReturn
   */
  export type EventStoreCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * The data used to create many EventStores.
     */
    data: EventStoreCreateManyInput | EventStoreCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventStore update
   */
  export type EventStoreUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * The data needed to update a EventStore.
     */
    data: XOR<EventStoreUpdateInput, EventStoreUncheckedUpdateInput>
    /**
     * Choose, which EventStore to update.
     */
    where: EventStoreWhereUniqueInput
  }

  /**
   * EventStore updateMany
   */
  export type EventStoreUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update EventStores.
     */
    data: XOR<EventStoreUpdateManyMutationInput, EventStoreUncheckedUpdateManyInput>
    /**
     * Filter which EventStores to update
     */
    where?: EventStoreWhereInput
    /**
     * Limit how many EventStores to update.
     */
    limit?: number
  }

  /**
   * EventStore updateManyAndReturn
   */
  export type EventStoreUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * The data used to update EventStores.
     */
    data: XOR<EventStoreUpdateManyMutationInput, EventStoreUncheckedUpdateManyInput>
    /**
     * Filter which EventStores to update
     */
    where?: EventStoreWhereInput
    /**
     * Limit how many EventStores to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * EventStore upsert
   */
  export type EventStoreUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * The filter to search for the EventStore to update in case it exists.
     */
    where: EventStoreWhereUniqueInput
    /**
     * In case the EventStore found by the `where` argument doesn't exist, create a new EventStore with this data.
     */
    create: XOR<EventStoreCreateInput, EventStoreUncheckedCreateInput>
    /**
     * In case the EventStore was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EventStoreUpdateInput, EventStoreUncheckedUpdateInput>
  }

  /**
   * EventStore delete
   */
  export type EventStoreDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    /**
     * Filter which EventStore to delete.
     */
    where: EventStoreWhereUniqueInput
  }

  /**
   * EventStore deleteMany
   */
  export type EventStoreDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EventStores to delete
     */
    where?: EventStoreWhereInput
    /**
     * Limit how many EventStores to delete.
     */
    limit?: number
  }

  /**
   * EventStore without action
   */
  export type EventStoreDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
  }


  /**
   * Model Event
   */

  export type AggregateEvent = {
    _count: EventCountAggregateOutputType | null
    _avg: EventAvgAggregateOutputType | null
    _sum: EventSumAggregateOutputType | null
    _min: EventMinAggregateOutputType | null
    _max: EventMaxAggregateOutputType | null
  }

  export type EventAvgAggregateOutputType = {
    limitedQuantity: number | null
  }

  export type EventSumAggregateOutputType = {
    limitedQuantity: number | null
  }

  export type EventMinAggregateOutputType = {
    id: string | null
    category: string | null
    name: string | null
    limitedQuantity: number | null
    startDate: Date | null
    endDate: Date | null
    endedAt: Date | null
    isVerified: boolean | null
    isPreliminary: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventMaxAggregateOutputType = {
    id: string | null
    category: string | null
    name: string | null
    limitedQuantity: number | null
    startDate: Date | null
    endDate: Date | null
    endedAt: Date | null
    isVerified: boolean | null
    isPreliminary: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EventCountAggregateOutputType = {
    id: number
    category: number
    name: number
    limitedQuantity: number
    startDate: number
    endDate: number
    endedAt: number
    isVerified: number
    isPreliminary: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type EventAvgAggregateInputType = {
    limitedQuantity?: true
  }

  export type EventSumAggregateInputType = {
    limitedQuantity?: true
  }

  export type EventMinAggregateInputType = {
    id?: true
    category?: true
    name?: true
    limitedQuantity?: true
    startDate?: true
    endDate?: true
    endedAt?: true
    isVerified?: true
    isPreliminary?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventMaxAggregateInputType = {
    id?: true
    category?: true
    name?: true
    limitedQuantity?: true
    startDate?: true
    endDate?: true
    endedAt?: true
    isVerified?: true
    isPreliminary?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EventCountAggregateInputType = {
    id?: true
    category?: true
    name?: true
    limitedQuantity?: true
    startDate?: true
    endDate?: true
    endedAt?: true
    isVerified?: true
    isPreliminary?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type EventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Event to aggregate.
     */
    where?: EventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Events to fetch.
     */
    orderBy?: EventOrderByWithRelationInput | EventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Events from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Events.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Events
    **/
    _count?: true | EventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: EventAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: EventSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EventMaxAggregateInputType
  }

  export type GetEventAggregateType<T extends EventAggregateArgs> = {
        [P in keyof T & keyof AggregateEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEvent[P]>
      : GetScalarType<T[P], AggregateEvent[P]>
  }




  export type EventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EventWhereInput
    orderBy?: EventOrderByWithAggregationInput | EventOrderByWithAggregationInput[]
    by: EventScalarFieldEnum[] | EventScalarFieldEnum
    having?: EventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EventCountAggregateInputType | true
    _avg?: EventAvgAggregateInputType
    _sum?: EventSumAggregateInputType
    _min?: EventMinAggregateInputType
    _max?: EventMaxAggregateInputType
  }

  export type EventGroupByOutputType = {
    id: string
    category: string
    name: string
    limitedQuantity: number | null
    startDate: Date
    endDate: Date | null
    endedAt: Date | null
    isVerified: boolean
    isPreliminary: boolean
    createdAt: Date
    updatedAt: Date
    _count: EventCountAggregateOutputType | null
    _avg: EventAvgAggregateOutputType | null
    _sum: EventSumAggregateOutputType | null
    _min: EventMinAggregateOutputType | null
    _max: EventMaxAggregateOutputType | null
  }

  type GetEventGroupByPayload<T extends EventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EventGroupByOutputType[P]>
            : GetScalarType<T[P], EventGroupByOutputType[P]>
        }
      >
    >


  export type EventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    category?: boolean
    name?: boolean
    limitedQuantity?: boolean
    startDate?: boolean
    endDate?: boolean
    endedAt?: boolean
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    conditions?: boolean | Event$conditionsArgs<ExtArgs>
    referenceUrls?: boolean | Event$referenceUrlsArgs<ExtArgs>
    stores?: boolean | Event$storesArgs<ExtArgs>
    _count?: boolean | EventCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["event"]>

  export type EventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    category?: boolean
    name?: boolean
    limitedQuantity?: boolean
    startDate?: boolean
    endDate?: boolean
    endedAt?: boolean
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["event"]>

  export type EventSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    category?: boolean
    name?: boolean
    limitedQuantity?: boolean
    startDate?: boolean
    endDate?: boolean
    endedAt?: boolean
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["event"]>

  export type EventSelectScalar = {
    id?: boolean
    category?: boolean
    name?: boolean
    limitedQuantity?: boolean
    startDate?: boolean
    endDate?: boolean
    endedAt?: boolean
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type EventOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "category" | "name" | "limitedQuantity" | "startDate" | "endDate" | "endedAt" | "isVerified" | "isPreliminary" | "createdAt" | "updatedAt", ExtArgs["result"]["event"]>
  export type EventInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    conditions?: boolean | Event$conditionsArgs<ExtArgs>
    referenceUrls?: boolean | Event$referenceUrlsArgs<ExtArgs>
    stores?: boolean | Event$storesArgs<ExtArgs>
    _count?: boolean | EventCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type EventIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type EventIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $EventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Event"
    objects: {
      /**
       * 配布条件
       */
      conditions: Prisma.$EventConditionPayload<ExtArgs>[]
      /**
       * 参考URL
       */
      referenceUrls: Prisma.$EventReferenceUrlPayload<ExtArgs>[]
      /**
       * 開催店舗
       */
      stores: Prisma.$EventStorePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      /**
       * イベント種別: limited_card, regular_card, ackey, other
       */
      category: string
      /**
       * イベント名
       */
      name: string
      /**
       * 限定数（任意）
       */
      limitedQuantity: number | null
      /**
       * 開始日時
       */
      startDate: Date
      /**
       * 終了予定日時（任意）
       */
      endDate: Date | null
      /**
       * 実際の終了日時（任意、配布が終了した実際の日時）
       */
      endedAt: Date | null
      /**
       * 公式情報として検証済みかどうか（管理者が作成/承認したもの）
       */
      isVerified: boolean
      /**
       * 公式発表前の未確定情報かどうか
       */
      isPreliminary: boolean
      /**
       * 作成日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["event"]>
    composites: {}
  }

  type EventGetPayload<S extends boolean | null | undefined | EventDefaultArgs> = $Result.GetResult<Prisma.$EventPayload, S>

  type EventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EventCountAggregateInputType | true
    }

  export interface EventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Event'], meta: { name: 'Event' } }
    /**
     * Find zero or one Event that matches the filter.
     * @param {EventFindUniqueArgs} args - Arguments to find a Event
     * @example
     * // Get one Event
     * const event = await prisma.event.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EventFindUniqueArgs>(args: SelectSubset<T, EventFindUniqueArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Event that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EventFindUniqueOrThrowArgs} args - Arguments to find a Event
     * @example
     * // Get one Event
     * const event = await prisma.event.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EventFindUniqueOrThrowArgs>(args: SelectSubset<T, EventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Event that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventFindFirstArgs} args - Arguments to find a Event
     * @example
     * // Get one Event
     * const event = await prisma.event.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EventFindFirstArgs>(args?: SelectSubset<T, EventFindFirstArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Event that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventFindFirstOrThrowArgs} args - Arguments to find a Event
     * @example
     * // Get one Event
     * const event = await prisma.event.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EventFindFirstOrThrowArgs>(args?: SelectSubset<T, EventFindFirstOrThrowArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Events that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Events
     * const events = await prisma.event.findMany()
     * 
     * // Get first 10 Events
     * const events = await prisma.event.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const eventWithIdOnly = await prisma.event.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EventFindManyArgs>(args?: SelectSubset<T, EventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Event.
     * @param {EventCreateArgs} args - Arguments to create a Event.
     * @example
     * // Create one Event
     * const Event = await prisma.event.create({
     *   data: {
     *     // ... data to create a Event
     *   }
     * })
     * 
     */
    create<T extends EventCreateArgs>(args: SelectSubset<T, EventCreateArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Events.
     * @param {EventCreateManyArgs} args - Arguments to create many Events.
     * @example
     * // Create many Events
     * const event = await prisma.event.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EventCreateManyArgs>(args?: SelectSubset<T, EventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Events and returns the data saved in the database.
     * @param {EventCreateManyAndReturnArgs} args - Arguments to create many Events.
     * @example
     * // Create many Events
     * const event = await prisma.event.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Events and only return the `id`
     * const eventWithIdOnly = await prisma.event.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends EventCreateManyAndReturnArgs>(args?: SelectSubset<T, EventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Event.
     * @param {EventDeleteArgs} args - Arguments to delete one Event.
     * @example
     * // Delete one Event
     * const Event = await prisma.event.delete({
     *   where: {
     *     // ... filter to delete one Event
     *   }
     * })
     * 
     */
    delete<T extends EventDeleteArgs>(args: SelectSubset<T, EventDeleteArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Event.
     * @param {EventUpdateArgs} args - Arguments to update one Event.
     * @example
     * // Update one Event
     * const event = await prisma.event.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EventUpdateArgs>(args: SelectSubset<T, EventUpdateArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Events.
     * @param {EventDeleteManyArgs} args - Arguments to filter Events to delete.
     * @example
     * // Delete a few Events
     * const { count } = await prisma.event.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EventDeleteManyArgs>(args?: SelectSubset<T, EventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Events.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Events
     * const event = await prisma.event.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EventUpdateManyArgs>(args: SelectSubset<T, EventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Events and returns the data updated in the database.
     * @param {EventUpdateManyAndReturnArgs} args - Arguments to update many Events.
     * @example
     * // Update many Events
     * const event = await prisma.event.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Events and only return the `id`
     * const eventWithIdOnly = await prisma.event.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends EventUpdateManyAndReturnArgs>(args: SelectSubset<T, EventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Event.
     * @param {EventUpsertArgs} args - Arguments to update or create a Event.
     * @example
     * // Update or create a Event
     * const event = await prisma.event.upsert({
     *   create: {
     *     // ... data to create a Event
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Event we want to update
     *   }
     * })
     */
    upsert<T extends EventUpsertArgs>(args: SelectSubset<T, EventUpsertArgs<ExtArgs>>): Prisma__EventClient<$Result.GetResult<Prisma.$EventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Events.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventCountArgs} args - Arguments to filter Events to count.
     * @example
     * // Count the number of Events
     * const count = await prisma.event.count({
     *   where: {
     *     // ... the filter for the Events we want to count
     *   }
     * })
    **/
    count<T extends EventCountArgs>(
      args?: Subset<T, EventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Event.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EventAggregateArgs>(args: Subset<T, EventAggregateArgs>): Prisma.PrismaPromise<GetEventAggregateType<T>>

    /**
     * Group by Event.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EventGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EventGroupByArgs['orderBy'] }
        : { orderBy?: EventGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Event model
   */
  readonly fields: EventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Event.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    conditions<T extends Event$conditionsArgs<ExtArgs> = {}>(args?: Subset<T, Event$conditionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventConditionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    referenceUrls<T extends Event$referenceUrlsArgs<ExtArgs> = {}>(args?: Subset<T, Event$referenceUrlsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventReferenceUrlPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    stores<T extends Event$storesArgs<ExtArgs> = {}>(args?: Subset<T, Event$storesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EventStorePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Event model
   */
  interface EventFieldRefs {
    readonly id: FieldRef<"Event", 'String'>
    readonly category: FieldRef<"Event", 'String'>
    readonly name: FieldRef<"Event", 'String'>
    readonly limitedQuantity: FieldRef<"Event", 'Int'>
    readonly startDate: FieldRef<"Event", 'DateTime'>
    readonly endDate: FieldRef<"Event", 'DateTime'>
    readonly endedAt: FieldRef<"Event", 'DateTime'>
    readonly isVerified: FieldRef<"Event", 'Boolean'>
    readonly isPreliminary: FieldRef<"Event", 'Boolean'>
    readonly createdAt: FieldRef<"Event", 'DateTime'>
    readonly updatedAt: FieldRef<"Event", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Event findUnique
   */
  export type EventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter, which Event to fetch.
     */
    where: EventWhereUniqueInput
  }

  /**
   * Event findUniqueOrThrow
   */
  export type EventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter, which Event to fetch.
     */
    where: EventWhereUniqueInput
  }

  /**
   * Event findFirst
   */
  export type EventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter, which Event to fetch.
     */
    where?: EventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Events to fetch.
     */
    orderBy?: EventOrderByWithRelationInput | EventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Events.
     */
    cursor?: EventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Events from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Events.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Events.
     */
    distinct?: EventScalarFieldEnum | EventScalarFieldEnum[]
  }

  /**
   * Event findFirstOrThrow
   */
  export type EventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter, which Event to fetch.
     */
    where?: EventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Events to fetch.
     */
    orderBy?: EventOrderByWithRelationInput | EventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Events.
     */
    cursor?: EventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Events from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Events.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Events.
     */
    distinct?: EventScalarFieldEnum | EventScalarFieldEnum[]
  }

  /**
   * Event findMany
   */
  export type EventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter, which Events to fetch.
     */
    where?: EventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Events to fetch.
     */
    orderBy?: EventOrderByWithRelationInput | EventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Events.
     */
    cursor?: EventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Events from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Events.
     */
    skip?: number
    distinct?: EventScalarFieldEnum | EventScalarFieldEnum[]
  }

  /**
   * Event create
   */
  export type EventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * The data needed to create a Event.
     */
    data: XOR<EventCreateInput, EventUncheckedCreateInput>
  }

  /**
   * Event createMany
   */
  export type EventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Events.
     */
    data: EventCreateManyInput | EventCreateManyInput[]
  }

  /**
   * Event createManyAndReturn
   */
  export type EventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * The data used to create many Events.
     */
    data: EventCreateManyInput | EventCreateManyInput[]
  }

  /**
   * Event update
   */
  export type EventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * The data needed to update a Event.
     */
    data: XOR<EventUpdateInput, EventUncheckedUpdateInput>
    /**
     * Choose, which Event to update.
     */
    where: EventWhereUniqueInput
  }

  /**
   * Event updateMany
   */
  export type EventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Events.
     */
    data: XOR<EventUpdateManyMutationInput, EventUncheckedUpdateManyInput>
    /**
     * Filter which Events to update
     */
    where?: EventWhereInput
    /**
     * Limit how many Events to update.
     */
    limit?: number
  }

  /**
   * Event updateManyAndReturn
   */
  export type EventUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * The data used to update Events.
     */
    data: XOR<EventUpdateManyMutationInput, EventUncheckedUpdateManyInput>
    /**
     * Filter which Events to update
     */
    where?: EventWhereInput
    /**
     * Limit how many Events to update.
     */
    limit?: number
  }

  /**
   * Event upsert
   */
  export type EventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * The filter to search for the Event to update in case it exists.
     */
    where: EventWhereUniqueInput
    /**
     * In case the Event found by the `where` argument doesn't exist, create a new Event with this data.
     */
    create: XOR<EventCreateInput, EventUncheckedCreateInput>
    /**
     * In case the Event was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EventUpdateInput, EventUncheckedUpdateInput>
  }

  /**
   * Event delete
   */
  export type EventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
    /**
     * Filter which Event to delete.
     */
    where: EventWhereUniqueInput
  }

  /**
   * Event deleteMany
   */
  export type EventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Events to delete
     */
    where?: EventWhereInput
    /**
     * Limit how many Events to delete.
     */
    limit?: number
  }

  /**
   * Event.conditions
   */
  export type Event$conditionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventCondition
     */
    select?: EventConditionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventCondition
     */
    omit?: EventConditionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventConditionInclude<ExtArgs> | null
    where?: EventConditionWhereInput
    orderBy?: EventConditionOrderByWithRelationInput | EventConditionOrderByWithRelationInput[]
    cursor?: EventConditionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EventConditionScalarFieldEnum | EventConditionScalarFieldEnum[]
  }

  /**
   * Event.referenceUrls
   */
  export type Event$referenceUrlsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventReferenceUrl
     */
    select?: EventReferenceUrlSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventReferenceUrl
     */
    omit?: EventReferenceUrlOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventReferenceUrlInclude<ExtArgs> | null
    where?: EventReferenceUrlWhereInput
    orderBy?: EventReferenceUrlOrderByWithRelationInput | EventReferenceUrlOrderByWithRelationInput[]
    cursor?: EventReferenceUrlWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EventReferenceUrlScalarFieldEnum | EventReferenceUrlScalarFieldEnum[]
  }

  /**
   * Event.stores
   */
  export type Event$storesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EventStore
     */
    select?: EventStoreSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EventStore
     */
    omit?: EventStoreOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventStoreInclude<ExtArgs> | null
    where?: EventStoreWhereInput
    orderBy?: EventStoreOrderByWithRelationInput | EventStoreOrderByWithRelationInput[]
    cursor?: EventStoreWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EventStoreScalarFieldEnum | EventStoreScalarFieldEnum[]
  }

  /**
   * Event without action
   */
  export type EventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Event
     */
    select?: EventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Event
     */
    omit?: EventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EventInclude<ExtArgs> | null
  }


  /**
   * Model Vote
   */

  export type AggregateVote = {
    _count: VoteCountAggregateOutputType | null
    _min: VoteMinAggregateOutputType | null
    _max: VoteMaxAggregateOutputType | null
  }

  export type VoteMinAggregateOutputType = {
    id: string | null
    characterId: string | null
    ipAddress: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VoteMaxAggregateOutputType = {
    id: string | null
    characterId: string | null
    ipAddress: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VoteCountAggregateOutputType = {
    id: number
    characterId: number
    ipAddress: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type VoteMinAggregateInputType = {
    id?: true
    characterId?: true
    ipAddress?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VoteMaxAggregateInputType = {
    id?: true
    characterId?: true
    ipAddress?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VoteCountAggregateInputType = {
    id?: true
    characterId?: true
    ipAddress?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type VoteAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Vote to aggregate.
     */
    where?: VoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Votes to fetch.
     */
    orderBy?: VoteOrderByWithRelationInput | VoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: VoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Votes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Votes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Votes
    **/
    _count?: true | VoteCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: VoteMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: VoteMaxAggregateInputType
  }

  export type GetVoteAggregateType<T extends VoteAggregateArgs> = {
        [P in keyof T & keyof AggregateVote]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateVote[P]>
      : GetScalarType<T[P], AggregateVote[P]>
  }




  export type VoteGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: VoteWhereInput
    orderBy?: VoteOrderByWithAggregationInput | VoteOrderByWithAggregationInput[]
    by: VoteScalarFieldEnum[] | VoteScalarFieldEnum
    having?: VoteScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: VoteCountAggregateInputType | true
    _min?: VoteMinAggregateInputType
    _max?: VoteMaxAggregateInputType
  }

  export type VoteGroupByOutputType = {
    id: string
    characterId: string
    ipAddress: string
    createdAt: Date
    updatedAt: Date
    _count: VoteCountAggregateOutputType | null
    _min: VoteMinAggregateOutputType | null
    _max: VoteMaxAggregateOutputType | null
  }

  type GetVoteGroupByPayload<T extends VoteGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<VoteGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof VoteGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], VoteGroupByOutputType[P]>
            : GetScalarType<T[P], VoteGroupByOutputType[P]>
        }
      >
    >


  export type VoteSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    characterId?: boolean
    ipAddress?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["vote"]>

  export type VoteSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    characterId?: boolean
    ipAddress?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["vote"]>

  export type VoteSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    characterId?: boolean
    ipAddress?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["vote"]>

  export type VoteSelectScalar = {
    id?: boolean
    characterId?: boolean
    ipAddress?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type VoteOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "characterId" | "ipAddress" | "createdAt" | "updatedAt", ExtArgs["result"]["vote"]>

  export type $VotePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Vote"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      /**
       * キャラクターID（例: biccame-001）
       */
      characterId: string
      /**
       * 投票者のIPアドレス
       */
      ipAddress: string
      /**
       * 投票日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["vote"]>
    composites: {}
  }

  type VoteGetPayload<S extends boolean | null | undefined | VoteDefaultArgs> = $Result.GetResult<Prisma.$VotePayload, S>

  type VoteCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<VoteFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: VoteCountAggregateInputType | true
    }

  export interface VoteDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Vote'], meta: { name: 'Vote' } }
    /**
     * Find zero or one Vote that matches the filter.
     * @param {VoteFindUniqueArgs} args - Arguments to find a Vote
     * @example
     * // Get one Vote
     * const vote = await prisma.vote.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends VoteFindUniqueArgs>(args: SelectSubset<T, VoteFindUniqueArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Vote that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {VoteFindUniqueOrThrowArgs} args - Arguments to find a Vote
     * @example
     * // Get one Vote
     * const vote = await prisma.vote.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends VoteFindUniqueOrThrowArgs>(args: SelectSubset<T, VoteFindUniqueOrThrowArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Vote that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteFindFirstArgs} args - Arguments to find a Vote
     * @example
     * // Get one Vote
     * const vote = await prisma.vote.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends VoteFindFirstArgs>(args?: SelectSubset<T, VoteFindFirstArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Vote that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteFindFirstOrThrowArgs} args - Arguments to find a Vote
     * @example
     * // Get one Vote
     * const vote = await prisma.vote.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends VoteFindFirstOrThrowArgs>(args?: SelectSubset<T, VoteFindFirstOrThrowArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Votes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Votes
     * const votes = await prisma.vote.findMany()
     * 
     * // Get first 10 Votes
     * const votes = await prisma.vote.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const voteWithIdOnly = await prisma.vote.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends VoteFindManyArgs>(args?: SelectSubset<T, VoteFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Vote.
     * @param {VoteCreateArgs} args - Arguments to create a Vote.
     * @example
     * // Create one Vote
     * const Vote = await prisma.vote.create({
     *   data: {
     *     // ... data to create a Vote
     *   }
     * })
     * 
     */
    create<T extends VoteCreateArgs>(args: SelectSubset<T, VoteCreateArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Votes.
     * @param {VoteCreateManyArgs} args - Arguments to create many Votes.
     * @example
     * // Create many Votes
     * const vote = await prisma.vote.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends VoteCreateManyArgs>(args?: SelectSubset<T, VoteCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Votes and returns the data saved in the database.
     * @param {VoteCreateManyAndReturnArgs} args - Arguments to create many Votes.
     * @example
     * // Create many Votes
     * const vote = await prisma.vote.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Votes and only return the `id`
     * const voteWithIdOnly = await prisma.vote.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends VoteCreateManyAndReturnArgs>(args?: SelectSubset<T, VoteCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Vote.
     * @param {VoteDeleteArgs} args - Arguments to delete one Vote.
     * @example
     * // Delete one Vote
     * const Vote = await prisma.vote.delete({
     *   where: {
     *     // ... filter to delete one Vote
     *   }
     * })
     * 
     */
    delete<T extends VoteDeleteArgs>(args: SelectSubset<T, VoteDeleteArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Vote.
     * @param {VoteUpdateArgs} args - Arguments to update one Vote.
     * @example
     * // Update one Vote
     * const vote = await prisma.vote.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends VoteUpdateArgs>(args: SelectSubset<T, VoteUpdateArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Votes.
     * @param {VoteDeleteManyArgs} args - Arguments to filter Votes to delete.
     * @example
     * // Delete a few Votes
     * const { count } = await prisma.vote.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends VoteDeleteManyArgs>(args?: SelectSubset<T, VoteDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Votes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Votes
     * const vote = await prisma.vote.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends VoteUpdateManyArgs>(args: SelectSubset<T, VoteUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Votes and returns the data updated in the database.
     * @param {VoteUpdateManyAndReturnArgs} args - Arguments to update many Votes.
     * @example
     * // Update many Votes
     * const vote = await prisma.vote.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Votes and only return the `id`
     * const voteWithIdOnly = await prisma.vote.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends VoteUpdateManyAndReturnArgs>(args: SelectSubset<T, VoteUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Vote.
     * @param {VoteUpsertArgs} args - Arguments to update or create a Vote.
     * @example
     * // Update or create a Vote
     * const vote = await prisma.vote.upsert({
     *   create: {
     *     // ... data to create a Vote
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Vote we want to update
     *   }
     * })
     */
    upsert<T extends VoteUpsertArgs>(args: SelectSubset<T, VoteUpsertArgs<ExtArgs>>): Prisma__VoteClient<$Result.GetResult<Prisma.$VotePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Votes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountArgs} args - Arguments to filter Votes to count.
     * @example
     * // Count the number of Votes
     * const count = await prisma.vote.count({
     *   where: {
     *     // ... the filter for the Votes we want to count
     *   }
     * })
    **/
    count<T extends VoteCountArgs>(
      args?: Subset<T, VoteCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], VoteCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Vote.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends VoteAggregateArgs>(args: Subset<T, VoteAggregateArgs>): Prisma.PrismaPromise<GetVoteAggregateType<T>>

    /**
     * Group by Vote.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends VoteGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: VoteGroupByArgs['orderBy'] }
        : { orderBy?: VoteGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, VoteGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetVoteGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Vote model
   */
  readonly fields: VoteFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Vote.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__VoteClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Vote model
   */
  interface VoteFieldRefs {
    readonly id: FieldRef<"Vote", 'String'>
    readonly characterId: FieldRef<"Vote", 'String'>
    readonly ipAddress: FieldRef<"Vote", 'String'>
    readonly createdAt: FieldRef<"Vote", 'DateTime'>
    readonly updatedAt: FieldRef<"Vote", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Vote findUnique
   */
  export type VoteFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter, which Vote to fetch.
     */
    where: VoteWhereUniqueInput
  }

  /**
   * Vote findUniqueOrThrow
   */
  export type VoteFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter, which Vote to fetch.
     */
    where: VoteWhereUniqueInput
  }

  /**
   * Vote findFirst
   */
  export type VoteFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter, which Vote to fetch.
     */
    where?: VoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Votes to fetch.
     */
    orderBy?: VoteOrderByWithRelationInput | VoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Votes.
     */
    cursor?: VoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Votes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Votes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Votes.
     */
    distinct?: VoteScalarFieldEnum | VoteScalarFieldEnum[]
  }

  /**
   * Vote findFirstOrThrow
   */
  export type VoteFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter, which Vote to fetch.
     */
    where?: VoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Votes to fetch.
     */
    orderBy?: VoteOrderByWithRelationInput | VoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Votes.
     */
    cursor?: VoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Votes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Votes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Votes.
     */
    distinct?: VoteScalarFieldEnum | VoteScalarFieldEnum[]
  }

  /**
   * Vote findMany
   */
  export type VoteFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter, which Votes to fetch.
     */
    where?: VoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Votes to fetch.
     */
    orderBy?: VoteOrderByWithRelationInput | VoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Votes.
     */
    cursor?: VoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Votes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Votes.
     */
    skip?: number
    distinct?: VoteScalarFieldEnum | VoteScalarFieldEnum[]
  }

  /**
   * Vote create
   */
  export type VoteCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * The data needed to create a Vote.
     */
    data: XOR<VoteCreateInput, VoteUncheckedCreateInput>
  }

  /**
   * Vote createMany
   */
  export type VoteCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Votes.
     */
    data: VoteCreateManyInput | VoteCreateManyInput[]
  }

  /**
   * Vote createManyAndReturn
   */
  export type VoteCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * The data used to create many Votes.
     */
    data: VoteCreateManyInput | VoteCreateManyInput[]
  }

  /**
   * Vote update
   */
  export type VoteUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * The data needed to update a Vote.
     */
    data: XOR<VoteUpdateInput, VoteUncheckedUpdateInput>
    /**
     * Choose, which Vote to update.
     */
    where: VoteWhereUniqueInput
  }

  /**
   * Vote updateMany
   */
  export type VoteUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Votes.
     */
    data: XOR<VoteUpdateManyMutationInput, VoteUncheckedUpdateManyInput>
    /**
     * Filter which Votes to update
     */
    where?: VoteWhereInput
    /**
     * Limit how many Votes to update.
     */
    limit?: number
  }

  /**
   * Vote updateManyAndReturn
   */
  export type VoteUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * The data used to update Votes.
     */
    data: XOR<VoteUpdateManyMutationInput, VoteUncheckedUpdateManyInput>
    /**
     * Filter which Votes to update
     */
    where?: VoteWhereInput
    /**
     * Limit how many Votes to update.
     */
    limit?: number
  }

  /**
   * Vote upsert
   */
  export type VoteUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * The filter to search for the Vote to update in case it exists.
     */
    where: VoteWhereUniqueInput
    /**
     * In case the Vote found by the `where` argument doesn't exist, create a new Vote with this data.
     */
    create: XOR<VoteCreateInput, VoteUncheckedCreateInput>
    /**
     * In case the Vote was found with the provided `where` argument, update it with this data.
     */
    update: XOR<VoteUpdateInput, VoteUncheckedUpdateInput>
  }

  /**
   * Vote delete
   */
  export type VoteDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
    /**
     * Filter which Vote to delete.
     */
    where: VoteWhereUniqueInput
  }

  /**
   * Vote deleteMany
   */
  export type VoteDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Votes to delete
     */
    where?: VoteWhereInput
    /**
     * Limit how many Votes to delete.
     */
    limit?: number
  }

  /**
   * Vote without action
   */
  export type VoteDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Vote
     */
    select?: VoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Vote
     */
    omit?: VoteOmit<ExtArgs> | null
  }


  /**
   * Model VoteCount
   */

  export type AggregateVoteCount = {
    _count: VoteCountCountAggregateOutputType | null
    _avg: VoteCountAvgAggregateOutputType | null
    _sum: VoteCountSumAggregateOutputType | null
    _min: VoteCountMinAggregateOutputType | null
    _max: VoteCountMaxAggregateOutputType | null
  }

  export type VoteCountAvgAggregateOutputType = {
    year: number | null
    count: number | null
  }

  export type VoteCountSumAggregateOutputType = {
    year: number | null
    count: number | null
  }

  export type VoteCountMinAggregateOutputType = {
    characterId: string | null
    year: number | null
    count: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VoteCountMaxAggregateOutputType = {
    characterId: string | null
    year: number | null
    count: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VoteCountCountAggregateOutputType = {
    characterId: number
    year: number
    count: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type VoteCountAvgAggregateInputType = {
    year?: true
    count?: true
  }

  export type VoteCountSumAggregateInputType = {
    year?: true
    count?: true
  }

  export type VoteCountMinAggregateInputType = {
    characterId?: true
    year?: true
    count?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VoteCountMaxAggregateInputType = {
    characterId?: true
    year?: true
    count?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VoteCountCountAggregateInputType = {
    characterId?: true
    year?: true
    count?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type VoteCountAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which VoteCount to aggregate.
     */
    where?: VoteCountWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VoteCounts to fetch.
     */
    orderBy?: VoteCountOrderByWithRelationInput | VoteCountOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: VoteCountWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VoteCounts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VoteCounts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned VoteCounts
    **/
    _count?: true | VoteCountCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: VoteCountAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: VoteCountSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: VoteCountMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: VoteCountMaxAggregateInputType
  }

  export type GetVoteCountAggregateType<T extends VoteCountAggregateArgs> = {
        [P in keyof T & keyof AggregateVoteCount]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateVoteCount[P]>
      : GetScalarType<T[P], AggregateVoteCount[P]>
  }




  export type VoteCountGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: VoteCountWhereInput
    orderBy?: VoteCountOrderByWithAggregationInput | VoteCountOrderByWithAggregationInput[]
    by: VoteCountScalarFieldEnum[] | VoteCountScalarFieldEnum
    having?: VoteCountScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: VoteCountCountAggregateInputType | true
    _avg?: VoteCountAvgAggregateInputType
    _sum?: VoteCountSumAggregateInputType
    _min?: VoteCountMinAggregateInputType
    _max?: VoteCountMaxAggregateInputType
  }

  export type VoteCountGroupByOutputType = {
    characterId: string
    year: number
    count: number
    createdAt: Date
    updatedAt: Date
    _count: VoteCountCountAggregateOutputType | null
    _avg: VoteCountAvgAggregateOutputType | null
    _sum: VoteCountSumAggregateOutputType | null
    _min: VoteCountMinAggregateOutputType | null
    _max: VoteCountMaxAggregateOutputType | null
  }

  type GetVoteCountGroupByPayload<T extends VoteCountGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<VoteCountGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof VoteCountGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], VoteCountGroupByOutputType[P]>
            : GetScalarType<T[P], VoteCountGroupByOutputType[P]>
        }
      >
    >


  export type VoteCountSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    characterId?: boolean
    year?: boolean
    count?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["voteCount"]>

  export type VoteCountSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    characterId?: boolean
    year?: boolean
    count?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["voteCount"]>

  export type VoteCountSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    characterId?: boolean
    year?: boolean
    count?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["voteCount"]>

  export type VoteCountSelectScalar = {
    characterId?: boolean
    year?: boolean
    count?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type VoteCountOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"characterId" | "year" | "count" | "createdAt" | "updatedAt", ExtArgs["result"]["voteCount"]>

  export type $VoteCountPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "VoteCount"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      /**
       * キャラクターID（例: biccame-001）
       */
      characterId: string
      /**
       * 年度（例: 2025, 2026）
       */
      year: number
      /**
       * 累計投票数
       */
      count: number
      /**
       * 投票日時
       */
      createdAt: Date
      /**
       * 更新日時
       */
      updatedAt: Date
    }, ExtArgs["result"]["voteCount"]>
    composites: {}
  }

  type VoteCountGetPayload<S extends boolean | null | undefined | VoteCountDefaultArgs> = $Result.GetResult<Prisma.$VoteCountPayload, S>

  type VoteCountCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<VoteCountFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: VoteCountCountAggregateInputType | true
    }

  export interface VoteCountDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['VoteCount'], meta: { name: 'VoteCount' } }
    /**
     * Find zero or one VoteCount that matches the filter.
     * @param {VoteCountFindUniqueArgs} args - Arguments to find a VoteCount
     * @example
     * // Get one VoteCount
     * const voteCount = await prisma.voteCount.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends VoteCountFindUniqueArgs>(args: SelectSubset<T, VoteCountFindUniqueArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one VoteCount that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {VoteCountFindUniqueOrThrowArgs} args - Arguments to find a VoteCount
     * @example
     * // Get one VoteCount
     * const voteCount = await prisma.voteCount.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends VoteCountFindUniqueOrThrowArgs>(args: SelectSubset<T, VoteCountFindUniqueOrThrowArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first VoteCount that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountFindFirstArgs} args - Arguments to find a VoteCount
     * @example
     * // Get one VoteCount
     * const voteCount = await prisma.voteCount.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends VoteCountFindFirstArgs>(args?: SelectSubset<T, VoteCountFindFirstArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first VoteCount that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountFindFirstOrThrowArgs} args - Arguments to find a VoteCount
     * @example
     * // Get one VoteCount
     * const voteCount = await prisma.voteCount.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends VoteCountFindFirstOrThrowArgs>(args?: SelectSubset<T, VoteCountFindFirstOrThrowArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more VoteCounts that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all VoteCounts
     * const voteCounts = await prisma.voteCount.findMany()
     * 
     * // Get first 10 VoteCounts
     * const voteCounts = await prisma.voteCount.findMany({ take: 10 })
     * 
     * // Only select the `characterId`
     * const voteCountWithCharacterIdOnly = await prisma.voteCount.findMany({ select: { characterId: true } })
     * 
     */
    findMany<T extends VoteCountFindManyArgs>(args?: SelectSubset<T, VoteCountFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a VoteCount.
     * @param {VoteCountCreateArgs} args - Arguments to create a VoteCount.
     * @example
     * // Create one VoteCount
     * const VoteCount = await prisma.voteCount.create({
     *   data: {
     *     // ... data to create a VoteCount
     *   }
     * })
     * 
     */
    create<T extends VoteCountCreateArgs>(args: SelectSubset<T, VoteCountCreateArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many VoteCounts.
     * @param {VoteCountCreateManyArgs} args - Arguments to create many VoteCounts.
     * @example
     * // Create many VoteCounts
     * const voteCount = await prisma.voteCount.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends VoteCountCreateManyArgs>(args?: SelectSubset<T, VoteCountCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many VoteCounts and returns the data saved in the database.
     * @param {VoteCountCreateManyAndReturnArgs} args - Arguments to create many VoteCounts.
     * @example
     * // Create many VoteCounts
     * const voteCount = await prisma.voteCount.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many VoteCounts and only return the `characterId`
     * const voteCountWithCharacterIdOnly = await prisma.voteCount.createManyAndReturn({
     *   select: { characterId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends VoteCountCreateManyAndReturnArgs>(args?: SelectSubset<T, VoteCountCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a VoteCount.
     * @param {VoteCountDeleteArgs} args - Arguments to delete one VoteCount.
     * @example
     * // Delete one VoteCount
     * const VoteCount = await prisma.voteCount.delete({
     *   where: {
     *     // ... filter to delete one VoteCount
     *   }
     * })
     * 
     */
    delete<T extends VoteCountDeleteArgs>(args: SelectSubset<T, VoteCountDeleteArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one VoteCount.
     * @param {VoteCountUpdateArgs} args - Arguments to update one VoteCount.
     * @example
     * // Update one VoteCount
     * const voteCount = await prisma.voteCount.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends VoteCountUpdateArgs>(args: SelectSubset<T, VoteCountUpdateArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more VoteCounts.
     * @param {VoteCountDeleteManyArgs} args - Arguments to filter VoteCounts to delete.
     * @example
     * // Delete a few VoteCounts
     * const { count } = await prisma.voteCount.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends VoteCountDeleteManyArgs>(args?: SelectSubset<T, VoteCountDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more VoteCounts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many VoteCounts
     * const voteCount = await prisma.voteCount.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends VoteCountUpdateManyArgs>(args: SelectSubset<T, VoteCountUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more VoteCounts and returns the data updated in the database.
     * @param {VoteCountUpdateManyAndReturnArgs} args - Arguments to update many VoteCounts.
     * @example
     * // Update many VoteCounts
     * const voteCount = await prisma.voteCount.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more VoteCounts and only return the `characterId`
     * const voteCountWithCharacterIdOnly = await prisma.voteCount.updateManyAndReturn({
     *   select: { characterId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends VoteCountUpdateManyAndReturnArgs>(args: SelectSubset<T, VoteCountUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one VoteCount.
     * @param {VoteCountUpsertArgs} args - Arguments to update or create a VoteCount.
     * @example
     * // Update or create a VoteCount
     * const voteCount = await prisma.voteCount.upsert({
     *   create: {
     *     // ... data to create a VoteCount
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the VoteCount we want to update
     *   }
     * })
     */
    upsert<T extends VoteCountUpsertArgs>(args: SelectSubset<T, VoteCountUpsertArgs<ExtArgs>>): Prisma__VoteCountClient<$Result.GetResult<Prisma.$VoteCountPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of VoteCounts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountCountArgs} args - Arguments to filter VoteCounts to count.
     * @example
     * // Count the number of VoteCounts
     * const count = await prisma.voteCount.count({
     *   where: {
     *     // ... the filter for the VoteCounts we want to count
     *   }
     * })
    **/
    count<T extends VoteCountCountArgs>(
      args?: Subset<T, VoteCountCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], VoteCountCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a VoteCount.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends VoteCountAggregateArgs>(args: Subset<T, VoteCountAggregateArgs>): Prisma.PrismaPromise<GetVoteCountAggregateType<T>>

    /**
     * Group by VoteCount.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VoteCountGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends VoteCountGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: VoteCountGroupByArgs['orderBy'] }
        : { orderBy?: VoteCountGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, VoteCountGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetVoteCountGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the VoteCount model
   */
  readonly fields: VoteCountFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for VoteCount.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__VoteCountClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the VoteCount model
   */
  interface VoteCountFieldRefs {
    readonly characterId: FieldRef<"VoteCount", 'String'>
    readonly year: FieldRef<"VoteCount", 'Int'>
    readonly count: FieldRef<"VoteCount", 'Int'>
    readonly createdAt: FieldRef<"VoteCount", 'DateTime'>
    readonly updatedAt: FieldRef<"VoteCount", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * VoteCount findUnique
   */
  export type VoteCountFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter, which VoteCount to fetch.
     */
    where: VoteCountWhereUniqueInput
  }

  /**
   * VoteCount findUniqueOrThrow
   */
  export type VoteCountFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter, which VoteCount to fetch.
     */
    where: VoteCountWhereUniqueInput
  }

  /**
   * VoteCount findFirst
   */
  export type VoteCountFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter, which VoteCount to fetch.
     */
    where?: VoteCountWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VoteCounts to fetch.
     */
    orderBy?: VoteCountOrderByWithRelationInput | VoteCountOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for VoteCounts.
     */
    cursor?: VoteCountWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VoteCounts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VoteCounts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of VoteCounts.
     */
    distinct?: VoteCountScalarFieldEnum | VoteCountScalarFieldEnum[]
  }

  /**
   * VoteCount findFirstOrThrow
   */
  export type VoteCountFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter, which VoteCount to fetch.
     */
    where?: VoteCountWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VoteCounts to fetch.
     */
    orderBy?: VoteCountOrderByWithRelationInput | VoteCountOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for VoteCounts.
     */
    cursor?: VoteCountWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VoteCounts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VoteCounts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of VoteCounts.
     */
    distinct?: VoteCountScalarFieldEnum | VoteCountScalarFieldEnum[]
  }

  /**
   * VoteCount findMany
   */
  export type VoteCountFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter, which VoteCounts to fetch.
     */
    where?: VoteCountWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VoteCounts to fetch.
     */
    orderBy?: VoteCountOrderByWithRelationInput | VoteCountOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing VoteCounts.
     */
    cursor?: VoteCountWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VoteCounts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VoteCounts.
     */
    skip?: number
    distinct?: VoteCountScalarFieldEnum | VoteCountScalarFieldEnum[]
  }

  /**
   * VoteCount create
   */
  export type VoteCountCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * The data needed to create a VoteCount.
     */
    data: XOR<VoteCountCreateInput, VoteCountUncheckedCreateInput>
  }

  /**
   * VoteCount createMany
   */
  export type VoteCountCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many VoteCounts.
     */
    data: VoteCountCreateManyInput | VoteCountCreateManyInput[]
  }

  /**
   * VoteCount createManyAndReturn
   */
  export type VoteCountCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * The data used to create many VoteCounts.
     */
    data: VoteCountCreateManyInput | VoteCountCreateManyInput[]
  }

  /**
   * VoteCount update
   */
  export type VoteCountUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * The data needed to update a VoteCount.
     */
    data: XOR<VoteCountUpdateInput, VoteCountUncheckedUpdateInput>
    /**
     * Choose, which VoteCount to update.
     */
    where: VoteCountWhereUniqueInput
  }

  /**
   * VoteCount updateMany
   */
  export type VoteCountUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update VoteCounts.
     */
    data: XOR<VoteCountUpdateManyMutationInput, VoteCountUncheckedUpdateManyInput>
    /**
     * Filter which VoteCounts to update
     */
    where?: VoteCountWhereInput
    /**
     * Limit how many VoteCounts to update.
     */
    limit?: number
  }

  /**
   * VoteCount updateManyAndReturn
   */
  export type VoteCountUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * The data used to update VoteCounts.
     */
    data: XOR<VoteCountUpdateManyMutationInput, VoteCountUncheckedUpdateManyInput>
    /**
     * Filter which VoteCounts to update
     */
    where?: VoteCountWhereInput
    /**
     * Limit how many VoteCounts to update.
     */
    limit?: number
  }

  /**
   * VoteCount upsert
   */
  export type VoteCountUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * The filter to search for the VoteCount to update in case it exists.
     */
    where: VoteCountWhereUniqueInput
    /**
     * In case the VoteCount found by the `where` argument doesn't exist, create a new VoteCount with this data.
     */
    create: XOR<VoteCountCreateInput, VoteCountUncheckedCreateInput>
    /**
     * In case the VoteCount was found with the provided `where` argument, update it with this data.
     */
    update: XOR<VoteCountUpdateInput, VoteCountUncheckedUpdateInput>
  }

  /**
   * VoteCount delete
   */
  export type VoteCountDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
    /**
     * Filter which VoteCount to delete.
     */
    where: VoteCountWhereUniqueInput
  }

  /**
   * VoteCount deleteMany
   */
  export type VoteCountDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which VoteCounts to delete
     */
    where?: VoteCountWhereInput
    /**
     * Limit how many VoteCounts to delete.
     */
    limit?: number
  }

  /**
   * VoteCount without action
   */
  export type VoteCountDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VoteCount
     */
    select?: VoteCountSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VoteCount
     */
    omit?: VoteCountOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const EventConditionScalarFieldEnum: {
    id: 'id',
    eventId: 'eventId',
    type: 'type',
    purchaseAmount: 'purchaseAmount',
    quantity: 'quantity',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type EventConditionScalarFieldEnum = (typeof EventConditionScalarFieldEnum)[keyof typeof EventConditionScalarFieldEnum]


  export const EventReferenceUrlScalarFieldEnum: {
    id: 'id',
    eventId: 'eventId',
    type: 'type',
    url: 'url',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type EventReferenceUrlScalarFieldEnum = (typeof EventReferenceUrlScalarFieldEnum)[keyof typeof EventReferenceUrlScalarFieldEnum]


  export const EventStoreScalarFieldEnum: {
    id: 'id',
    eventId: 'eventId',
    storeKey: 'storeKey',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type EventStoreScalarFieldEnum = (typeof EventStoreScalarFieldEnum)[keyof typeof EventStoreScalarFieldEnum]


  export const EventScalarFieldEnum: {
    id: 'id',
    category: 'category',
    name: 'name',
    limitedQuantity: 'limitedQuantity',
    startDate: 'startDate',
    endDate: 'endDate',
    endedAt: 'endedAt',
    isVerified: 'isVerified',
    isPreliminary: 'isPreliminary',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type EventScalarFieldEnum = (typeof EventScalarFieldEnum)[keyof typeof EventScalarFieldEnum]


  export const VoteScalarFieldEnum: {
    id: 'id',
    characterId: 'characterId',
    ipAddress: 'ipAddress',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type VoteScalarFieldEnum = (typeof VoteScalarFieldEnum)[keyof typeof VoteScalarFieldEnum]


  export const VoteCountScalarFieldEnum: {
    characterId: 'characterId',
    year: 'year',
    count: 'count',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type VoteCountScalarFieldEnum = (typeof VoteCountScalarFieldEnum)[keyof typeof VoteCountScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type EventConditionWhereInput = {
    AND?: EventConditionWhereInput | EventConditionWhereInput[]
    OR?: EventConditionWhereInput[]
    NOT?: EventConditionWhereInput | EventConditionWhereInput[]
    id?: StringFilter<"EventCondition"> | string
    eventId?: StringFilter<"EventCondition"> | string
    type?: StringFilter<"EventCondition"> | string
    purchaseAmount?: IntNullableFilter<"EventCondition"> | number | null
    quantity?: IntNullableFilter<"EventCondition"> | number | null
    createdAt?: DateTimeFilter<"EventCondition"> | Date | string
    updatedAt?: DateTimeFilter<"EventCondition"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }

  export type EventConditionOrderByWithRelationInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    purchaseAmount?: SortOrderInput | SortOrder
    quantity?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    event?: EventOrderByWithRelationInput
  }

  export type EventConditionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: EventConditionWhereInput | EventConditionWhereInput[]
    OR?: EventConditionWhereInput[]
    NOT?: EventConditionWhereInput | EventConditionWhereInput[]
    eventId?: StringFilter<"EventCondition"> | string
    type?: StringFilter<"EventCondition"> | string
    purchaseAmount?: IntNullableFilter<"EventCondition"> | number | null
    quantity?: IntNullableFilter<"EventCondition"> | number | null
    createdAt?: DateTimeFilter<"EventCondition"> | Date | string
    updatedAt?: DateTimeFilter<"EventCondition"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }, "id">

  export type EventConditionOrderByWithAggregationInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    purchaseAmount?: SortOrderInput | SortOrder
    quantity?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: EventConditionCountOrderByAggregateInput
    _avg?: EventConditionAvgOrderByAggregateInput
    _max?: EventConditionMaxOrderByAggregateInput
    _min?: EventConditionMinOrderByAggregateInput
    _sum?: EventConditionSumOrderByAggregateInput
  }

  export type EventConditionScalarWhereWithAggregatesInput = {
    AND?: EventConditionScalarWhereWithAggregatesInput | EventConditionScalarWhereWithAggregatesInput[]
    OR?: EventConditionScalarWhereWithAggregatesInput[]
    NOT?: EventConditionScalarWhereWithAggregatesInput | EventConditionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"EventCondition"> | string
    eventId?: StringWithAggregatesFilter<"EventCondition"> | string
    type?: StringWithAggregatesFilter<"EventCondition"> | string
    purchaseAmount?: IntNullableWithAggregatesFilter<"EventCondition"> | number | null
    quantity?: IntNullableWithAggregatesFilter<"EventCondition"> | number | null
    createdAt?: DateTimeWithAggregatesFilter<"EventCondition"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"EventCondition"> | Date | string
  }

  export type EventReferenceUrlWhereInput = {
    AND?: EventReferenceUrlWhereInput | EventReferenceUrlWhereInput[]
    OR?: EventReferenceUrlWhereInput[]
    NOT?: EventReferenceUrlWhereInput | EventReferenceUrlWhereInput[]
    id?: StringFilter<"EventReferenceUrl"> | string
    eventId?: StringFilter<"EventReferenceUrl"> | string
    type?: StringFilter<"EventReferenceUrl"> | string
    url?: StringFilter<"EventReferenceUrl"> | string
    createdAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
    updatedAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }

  export type EventReferenceUrlOrderByWithRelationInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    url?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    event?: EventOrderByWithRelationInput
  }

  export type EventReferenceUrlWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: EventReferenceUrlWhereInput | EventReferenceUrlWhereInput[]
    OR?: EventReferenceUrlWhereInput[]
    NOT?: EventReferenceUrlWhereInput | EventReferenceUrlWhereInput[]
    eventId?: StringFilter<"EventReferenceUrl"> | string
    type?: StringFilter<"EventReferenceUrl"> | string
    url?: StringFilter<"EventReferenceUrl"> | string
    createdAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
    updatedAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }, "id">

  export type EventReferenceUrlOrderByWithAggregationInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    url?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: EventReferenceUrlCountOrderByAggregateInput
    _max?: EventReferenceUrlMaxOrderByAggregateInput
    _min?: EventReferenceUrlMinOrderByAggregateInput
  }

  export type EventReferenceUrlScalarWhereWithAggregatesInput = {
    AND?: EventReferenceUrlScalarWhereWithAggregatesInput | EventReferenceUrlScalarWhereWithAggregatesInput[]
    OR?: EventReferenceUrlScalarWhereWithAggregatesInput[]
    NOT?: EventReferenceUrlScalarWhereWithAggregatesInput | EventReferenceUrlScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"EventReferenceUrl"> | string
    eventId?: StringWithAggregatesFilter<"EventReferenceUrl"> | string
    type?: StringWithAggregatesFilter<"EventReferenceUrl"> | string
    url?: StringWithAggregatesFilter<"EventReferenceUrl"> | string
    createdAt?: DateTimeWithAggregatesFilter<"EventReferenceUrl"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"EventReferenceUrl"> | Date | string
  }

  export type EventStoreWhereInput = {
    AND?: EventStoreWhereInput | EventStoreWhereInput[]
    OR?: EventStoreWhereInput[]
    NOT?: EventStoreWhereInput | EventStoreWhereInput[]
    id?: StringFilter<"EventStore"> | string
    eventId?: StringFilter<"EventStore"> | string
    storeKey?: StringFilter<"EventStore"> | string
    createdAt?: DateTimeFilter<"EventStore"> | Date | string
    updatedAt?: DateTimeFilter<"EventStore"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }

  export type EventStoreOrderByWithRelationInput = {
    id?: SortOrder
    eventId?: SortOrder
    storeKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    event?: EventOrderByWithRelationInput
  }

  export type EventStoreWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    eventId_storeKey?: EventStoreEventIdStoreKeyCompoundUniqueInput
    AND?: EventStoreWhereInput | EventStoreWhereInput[]
    OR?: EventStoreWhereInput[]
    NOT?: EventStoreWhereInput | EventStoreWhereInput[]
    eventId?: StringFilter<"EventStore"> | string
    storeKey?: StringFilter<"EventStore"> | string
    createdAt?: DateTimeFilter<"EventStore"> | Date | string
    updatedAt?: DateTimeFilter<"EventStore"> | Date | string
    event?: XOR<EventScalarRelationFilter, EventWhereInput>
  }, "id" | "eventId_storeKey">

  export type EventStoreOrderByWithAggregationInput = {
    id?: SortOrder
    eventId?: SortOrder
    storeKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: EventStoreCountOrderByAggregateInput
    _max?: EventStoreMaxOrderByAggregateInput
    _min?: EventStoreMinOrderByAggregateInput
  }

  export type EventStoreScalarWhereWithAggregatesInput = {
    AND?: EventStoreScalarWhereWithAggregatesInput | EventStoreScalarWhereWithAggregatesInput[]
    OR?: EventStoreScalarWhereWithAggregatesInput[]
    NOT?: EventStoreScalarWhereWithAggregatesInput | EventStoreScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"EventStore"> | string
    eventId?: StringWithAggregatesFilter<"EventStore"> | string
    storeKey?: StringWithAggregatesFilter<"EventStore"> | string
    createdAt?: DateTimeWithAggregatesFilter<"EventStore"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"EventStore"> | Date | string
  }

  export type EventWhereInput = {
    AND?: EventWhereInput | EventWhereInput[]
    OR?: EventWhereInput[]
    NOT?: EventWhereInput | EventWhereInput[]
    id?: StringFilter<"Event"> | string
    category?: StringFilter<"Event"> | string
    name?: StringFilter<"Event"> | string
    limitedQuantity?: IntNullableFilter<"Event"> | number | null
    startDate?: DateTimeFilter<"Event"> | Date | string
    endDate?: DateTimeNullableFilter<"Event"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"Event"> | Date | string | null
    isVerified?: BoolFilter<"Event"> | boolean
    isPreliminary?: BoolFilter<"Event"> | boolean
    createdAt?: DateTimeFilter<"Event"> | Date | string
    updatedAt?: DateTimeFilter<"Event"> | Date | string
    conditions?: EventConditionListRelationFilter
    referenceUrls?: EventReferenceUrlListRelationFilter
    stores?: EventStoreListRelationFilter
  }

  export type EventOrderByWithRelationInput = {
    id?: SortOrder
    category?: SortOrder
    name?: SortOrder
    limitedQuantity?: SortOrderInput | SortOrder
    startDate?: SortOrder
    endDate?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    isVerified?: SortOrder
    isPreliminary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    conditions?: EventConditionOrderByRelationAggregateInput
    referenceUrls?: EventReferenceUrlOrderByRelationAggregateInput
    stores?: EventStoreOrderByRelationAggregateInput
  }

  export type EventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: EventWhereInput | EventWhereInput[]
    OR?: EventWhereInput[]
    NOT?: EventWhereInput | EventWhereInput[]
    category?: StringFilter<"Event"> | string
    name?: StringFilter<"Event"> | string
    limitedQuantity?: IntNullableFilter<"Event"> | number | null
    startDate?: DateTimeFilter<"Event"> | Date | string
    endDate?: DateTimeNullableFilter<"Event"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"Event"> | Date | string | null
    isVerified?: BoolFilter<"Event"> | boolean
    isPreliminary?: BoolFilter<"Event"> | boolean
    createdAt?: DateTimeFilter<"Event"> | Date | string
    updatedAt?: DateTimeFilter<"Event"> | Date | string
    conditions?: EventConditionListRelationFilter
    referenceUrls?: EventReferenceUrlListRelationFilter
    stores?: EventStoreListRelationFilter
  }, "id">

  export type EventOrderByWithAggregationInput = {
    id?: SortOrder
    category?: SortOrder
    name?: SortOrder
    limitedQuantity?: SortOrderInput | SortOrder
    startDate?: SortOrder
    endDate?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    isVerified?: SortOrder
    isPreliminary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: EventCountOrderByAggregateInput
    _avg?: EventAvgOrderByAggregateInput
    _max?: EventMaxOrderByAggregateInput
    _min?: EventMinOrderByAggregateInput
    _sum?: EventSumOrderByAggregateInput
  }

  export type EventScalarWhereWithAggregatesInput = {
    AND?: EventScalarWhereWithAggregatesInput | EventScalarWhereWithAggregatesInput[]
    OR?: EventScalarWhereWithAggregatesInput[]
    NOT?: EventScalarWhereWithAggregatesInput | EventScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Event"> | string
    category?: StringWithAggregatesFilter<"Event"> | string
    name?: StringWithAggregatesFilter<"Event"> | string
    limitedQuantity?: IntNullableWithAggregatesFilter<"Event"> | number | null
    startDate?: DateTimeWithAggregatesFilter<"Event"> | Date | string
    endDate?: DateTimeNullableWithAggregatesFilter<"Event"> | Date | string | null
    endedAt?: DateTimeNullableWithAggregatesFilter<"Event"> | Date | string | null
    isVerified?: BoolWithAggregatesFilter<"Event"> | boolean
    isPreliminary?: BoolWithAggregatesFilter<"Event"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Event"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Event"> | Date | string
  }

  export type VoteWhereInput = {
    AND?: VoteWhereInput | VoteWhereInput[]
    OR?: VoteWhereInput[]
    NOT?: VoteWhereInput | VoteWhereInput[]
    id?: StringFilter<"Vote"> | string
    characterId?: StringFilter<"Vote"> | string
    ipAddress?: StringFilter<"Vote"> | string
    createdAt?: DateTimeFilter<"Vote"> | Date | string
    updatedAt?: DateTimeFilter<"Vote"> | Date | string
  }

  export type VoteOrderByWithRelationInput = {
    id?: SortOrder
    characterId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: VoteWhereInput | VoteWhereInput[]
    OR?: VoteWhereInput[]
    NOT?: VoteWhereInput | VoteWhereInput[]
    characterId?: StringFilter<"Vote"> | string
    ipAddress?: StringFilter<"Vote"> | string
    createdAt?: DateTimeFilter<"Vote"> | Date | string
    updatedAt?: DateTimeFilter<"Vote"> | Date | string
  }, "id">

  export type VoteOrderByWithAggregationInput = {
    id?: SortOrder
    characterId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: VoteCountOrderByAggregateInput
    _max?: VoteMaxOrderByAggregateInput
    _min?: VoteMinOrderByAggregateInput
  }

  export type VoteScalarWhereWithAggregatesInput = {
    AND?: VoteScalarWhereWithAggregatesInput | VoteScalarWhereWithAggregatesInput[]
    OR?: VoteScalarWhereWithAggregatesInput[]
    NOT?: VoteScalarWhereWithAggregatesInput | VoteScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Vote"> | string
    characterId?: StringWithAggregatesFilter<"Vote"> | string
    ipAddress?: StringWithAggregatesFilter<"Vote"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Vote"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Vote"> | Date | string
  }

  export type VoteCountWhereInput = {
    AND?: VoteCountWhereInput | VoteCountWhereInput[]
    OR?: VoteCountWhereInput[]
    NOT?: VoteCountWhereInput | VoteCountWhereInput[]
    characterId?: StringFilter<"VoteCount"> | string
    year?: IntFilter<"VoteCount"> | number
    count?: IntFilter<"VoteCount"> | number
    createdAt?: DateTimeFilter<"VoteCount"> | Date | string
    updatedAt?: DateTimeFilter<"VoteCount"> | Date | string
  }

  export type VoteCountOrderByWithRelationInput = {
    characterId?: SortOrder
    year?: SortOrder
    count?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteCountWhereUniqueInput = Prisma.AtLeast<{
    characterId_year?: VoteCountCharacterIdYearCompoundUniqueInput
    AND?: VoteCountWhereInput | VoteCountWhereInput[]
    OR?: VoteCountWhereInput[]
    NOT?: VoteCountWhereInput | VoteCountWhereInput[]
    characterId?: StringFilter<"VoteCount"> | string
    year?: IntFilter<"VoteCount"> | number
    count?: IntFilter<"VoteCount"> | number
    createdAt?: DateTimeFilter<"VoteCount"> | Date | string
    updatedAt?: DateTimeFilter<"VoteCount"> | Date | string
  }, "characterId_year">

  export type VoteCountOrderByWithAggregationInput = {
    characterId?: SortOrder
    year?: SortOrder
    count?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: VoteCountCountOrderByAggregateInput
    _avg?: VoteCountAvgOrderByAggregateInput
    _max?: VoteCountMaxOrderByAggregateInput
    _min?: VoteCountMinOrderByAggregateInput
    _sum?: VoteCountSumOrderByAggregateInput
  }

  export type VoteCountScalarWhereWithAggregatesInput = {
    AND?: VoteCountScalarWhereWithAggregatesInput | VoteCountScalarWhereWithAggregatesInput[]
    OR?: VoteCountScalarWhereWithAggregatesInput[]
    NOT?: VoteCountScalarWhereWithAggregatesInput | VoteCountScalarWhereWithAggregatesInput[]
    characterId?: StringWithAggregatesFilter<"VoteCount"> | string
    year?: IntWithAggregatesFilter<"VoteCount"> | number
    count?: IntWithAggregatesFilter<"VoteCount"> | number
    createdAt?: DateTimeWithAggregatesFilter<"VoteCount"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"VoteCount"> | Date | string
  }

  export type EventConditionCreateInput = {
    id?: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    event: EventCreateNestedOneWithoutConditionsInput
  }

  export type EventConditionUncheckedCreateInput = {
    id?: string
    eventId: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventConditionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    event?: EventUpdateOneRequiredWithoutConditionsNestedInput
  }

  export type EventConditionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventConditionCreateManyInput = {
    id?: string
    eventId: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventConditionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventConditionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlCreateInput = {
    id?: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
    event: EventCreateNestedOneWithoutReferenceUrlsInput
  }

  export type EventReferenceUrlUncheckedCreateInput = {
    id?: string
    eventId: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventReferenceUrlUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    event?: EventUpdateOneRequiredWithoutReferenceUrlsNestedInput
  }

  export type EventReferenceUrlUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlCreateManyInput = {
    id?: string
    eventId: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventReferenceUrlUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreCreateInput = {
    id?: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
    event: EventCreateNestedOneWithoutStoresInput
  }

  export type EventStoreUncheckedCreateInput = {
    id?: string
    eventId: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventStoreUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    event?: EventUpdateOneRequiredWithoutStoresNestedInput
  }

  export type EventStoreUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreCreateManyInput = {
    id?: string
    eventId: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventStoreUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventId?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventCreateInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionCreateNestedManyWithoutEventInput
    referenceUrls?: EventReferenceUrlCreateNestedManyWithoutEventInput
    stores?: EventStoreCreateNestedManyWithoutEventInput
  }

  export type EventUncheckedCreateInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionUncheckedCreateNestedManyWithoutEventInput
    referenceUrls?: EventReferenceUrlUncheckedCreateNestedManyWithoutEventInput
    stores?: EventStoreUncheckedCreateNestedManyWithoutEventInput
  }

  export type EventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUpdateManyWithoutEventNestedInput
    referenceUrls?: EventReferenceUrlUpdateManyWithoutEventNestedInput
    stores?: EventStoreUpdateManyWithoutEventNestedInput
  }

  export type EventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUncheckedUpdateManyWithoutEventNestedInput
    referenceUrls?: EventReferenceUrlUncheckedUpdateManyWithoutEventNestedInput
    stores?: EventStoreUncheckedUpdateManyWithoutEventNestedInput
  }

  export type EventCreateManyInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCreateInput = {
    id?: string
    characterId: string
    ipAddress: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteUncheckedCreateInput = {
    id?: string
    characterId: string
    ipAddress: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    characterId?: StringFieldUpdateOperationsInput | string
    ipAddress?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    characterId?: StringFieldUpdateOperationsInput | string
    ipAddress?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCreateManyInput = {
    id?: string
    characterId: string
    ipAddress: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    characterId?: StringFieldUpdateOperationsInput | string
    ipAddress?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    characterId?: StringFieldUpdateOperationsInput | string
    ipAddress?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCountCreateInput = {
    characterId: string
    year: number
    count?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteCountUncheckedCreateInput = {
    characterId: string
    year: number
    count?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteCountUpdateInput = {
    characterId?: StringFieldUpdateOperationsInput | string
    year?: IntFieldUpdateOperationsInput | number
    count?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCountUncheckedUpdateInput = {
    characterId?: StringFieldUpdateOperationsInput | string
    year?: IntFieldUpdateOperationsInput | number
    count?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCountCreateManyInput = {
    characterId: string
    year: number
    count?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VoteCountUpdateManyMutationInput = {
    characterId?: StringFieldUpdateOperationsInput | string
    year?: IntFieldUpdateOperationsInput | number
    count?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VoteCountUncheckedUpdateManyInput = {
    characterId?: StringFieldUpdateOperationsInput | string
    year?: IntFieldUpdateOperationsInput | number
    count?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type EventScalarRelationFilter = {
    is?: EventWhereInput
    isNot?: EventWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type EventConditionCountOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    purchaseAmount?: SortOrder
    quantity?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventConditionAvgOrderByAggregateInput = {
    purchaseAmount?: SortOrder
    quantity?: SortOrder
  }

  export type EventConditionMaxOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    purchaseAmount?: SortOrder
    quantity?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventConditionMinOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    purchaseAmount?: SortOrder
    quantity?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventConditionSumOrderByAggregateInput = {
    purchaseAmount?: SortOrder
    quantity?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type EventReferenceUrlCountOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    url?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventReferenceUrlMaxOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    url?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventReferenceUrlMinOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    type?: SortOrder
    url?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventStoreEventIdStoreKeyCompoundUniqueInput = {
    eventId: string
    storeKey: string
  }

  export type EventStoreCountOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    storeKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventStoreMaxOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    storeKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventStoreMinOrderByAggregateInput = {
    id?: SortOrder
    eventId?: SortOrder
    storeKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type EventConditionListRelationFilter = {
    every?: EventConditionWhereInput
    some?: EventConditionWhereInput
    none?: EventConditionWhereInput
  }

  export type EventReferenceUrlListRelationFilter = {
    every?: EventReferenceUrlWhereInput
    some?: EventReferenceUrlWhereInput
    none?: EventReferenceUrlWhereInput
  }

  export type EventStoreListRelationFilter = {
    every?: EventStoreWhereInput
    some?: EventStoreWhereInput
    none?: EventStoreWhereInput
  }

  export type EventConditionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type EventReferenceUrlOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type EventStoreOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type EventCountOrderByAggregateInput = {
    id?: SortOrder
    category?: SortOrder
    name?: SortOrder
    limitedQuantity?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    endedAt?: SortOrder
    isVerified?: SortOrder
    isPreliminary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventAvgOrderByAggregateInput = {
    limitedQuantity?: SortOrder
  }

  export type EventMaxOrderByAggregateInput = {
    id?: SortOrder
    category?: SortOrder
    name?: SortOrder
    limitedQuantity?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    endedAt?: SortOrder
    isVerified?: SortOrder
    isPreliminary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventMinOrderByAggregateInput = {
    id?: SortOrder
    category?: SortOrder
    name?: SortOrder
    limitedQuantity?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    endedAt?: SortOrder
    isVerified?: SortOrder
    isPreliminary?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EventSumOrderByAggregateInput = {
    limitedQuantity?: SortOrder
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type VoteCountOrderByAggregateInput = {
    id?: SortOrder
    characterId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteMaxOrderByAggregateInput = {
    id?: SortOrder
    characterId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteMinOrderByAggregateInput = {
    id?: SortOrder
    characterId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type VoteCountCharacterIdYearCompoundUniqueInput = {
    characterId: string
    year: number
  }

  export type VoteCountCountOrderByAggregateInput = {
    characterId?: SortOrder
    year?: SortOrder
    count?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteCountAvgOrderByAggregateInput = {
    year?: SortOrder
    count?: SortOrder
  }

  export type VoteCountMaxOrderByAggregateInput = {
    characterId?: SortOrder
    year?: SortOrder
    count?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteCountMinOrderByAggregateInput = {
    characterId?: SortOrder
    year?: SortOrder
    count?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VoteCountSumOrderByAggregateInput = {
    year?: SortOrder
    count?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type EventCreateNestedOneWithoutConditionsInput = {
    create?: XOR<EventCreateWithoutConditionsInput, EventUncheckedCreateWithoutConditionsInput>
    connectOrCreate?: EventCreateOrConnectWithoutConditionsInput
    connect?: EventWhereUniqueInput
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type EventUpdateOneRequiredWithoutConditionsNestedInput = {
    create?: XOR<EventCreateWithoutConditionsInput, EventUncheckedCreateWithoutConditionsInput>
    connectOrCreate?: EventCreateOrConnectWithoutConditionsInput
    upsert?: EventUpsertWithoutConditionsInput
    connect?: EventWhereUniqueInput
    update?: XOR<XOR<EventUpdateToOneWithWhereWithoutConditionsInput, EventUpdateWithoutConditionsInput>, EventUncheckedUpdateWithoutConditionsInput>
  }

  export type EventCreateNestedOneWithoutReferenceUrlsInput = {
    create?: XOR<EventCreateWithoutReferenceUrlsInput, EventUncheckedCreateWithoutReferenceUrlsInput>
    connectOrCreate?: EventCreateOrConnectWithoutReferenceUrlsInput
    connect?: EventWhereUniqueInput
  }

  export type EventUpdateOneRequiredWithoutReferenceUrlsNestedInput = {
    create?: XOR<EventCreateWithoutReferenceUrlsInput, EventUncheckedCreateWithoutReferenceUrlsInput>
    connectOrCreate?: EventCreateOrConnectWithoutReferenceUrlsInput
    upsert?: EventUpsertWithoutReferenceUrlsInput
    connect?: EventWhereUniqueInput
    update?: XOR<XOR<EventUpdateToOneWithWhereWithoutReferenceUrlsInput, EventUpdateWithoutReferenceUrlsInput>, EventUncheckedUpdateWithoutReferenceUrlsInput>
  }

  export type EventCreateNestedOneWithoutStoresInput = {
    create?: XOR<EventCreateWithoutStoresInput, EventUncheckedCreateWithoutStoresInput>
    connectOrCreate?: EventCreateOrConnectWithoutStoresInput
    connect?: EventWhereUniqueInput
  }

  export type EventUpdateOneRequiredWithoutStoresNestedInput = {
    create?: XOR<EventCreateWithoutStoresInput, EventUncheckedCreateWithoutStoresInput>
    connectOrCreate?: EventCreateOrConnectWithoutStoresInput
    upsert?: EventUpsertWithoutStoresInput
    connect?: EventWhereUniqueInput
    update?: XOR<XOR<EventUpdateToOneWithWhereWithoutStoresInput, EventUpdateWithoutStoresInput>, EventUncheckedUpdateWithoutStoresInput>
  }

  export type EventConditionCreateNestedManyWithoutEventInput = {
    create?: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput> | EventConditionCreateWithoutEventInput[] | EventConditionUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventConditionCreateOrConnectWithoutEventInput | EventConditionCreateOrConnectWithoutEventInput[]
    createMany?: EventConditionCreateManyEventInputEnvelope
    connect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
  }

  export type EventReferenceUrlCreateNestedManyWithoutEventInput = {
    create?: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput> | EventReferenceUrlCreateWithoutEventInput[] | EventReferenceUrlUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventReferenceUrlCreateOrConnectWithoutEventInput | EventReferenceUrlCreateOrConnectWithoutEventInput[]
    createMany?: EventReferenceUrlCreateManyEventInputEnvelope
    connect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
  }

  export type EventStoreCreateNestedManyWithoutEventInput = {
    create?: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput> | EventStoreCreateWithoutEventInput[] | EventStoreUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventStoreCreateOrConnectWithoutEventInput | EventStoreCreateOrConnectWithoutEventInput[]
    createMany?: EventStoreCreateManyEventInputEnvelope
    connect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
  }

  export type EventConditionUncheckedCreateNestedManyWithoutEventInput = {
    create?: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput> | EventConditionCreateWithoutEventInput[] | EventConditionUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventConditionCreateOrConnectWithoutEventInput | EventConditionCreateOrConnectWithoutEventInput[]
    createMany?: EventConditionCreateManyEventInputEnvelope
    connect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
  }

  export type EventReferenceUrlUncheckedCreateNestedManyWithoutEventInput = {
    create?: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput> | EventReferenceUrlCreateWithoutEventInput[] | EventReferenceUrlUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventReferenceUrlCreateOrConnectWithoutEventInput | EventReferenceUrlCreateOrConnectWithoutEventInput[]
    createMany?: EventReferenceUrlCreateManyEventInputEnvelope
    connect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
  }

  export type EventStoreUncheckedCreateNestedManyWithoutEventInput = {
    create?: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput> | EventStoreCreateWithoutEventInput[] | EventStoreUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventStoreCreateOrConnectWithoutEventInput | EventStoreCreateOrConnectWithoutEventInput[]
    createMany?: EventStoreCreateManyEventInputEnvelope
    connect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type EventConditionUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput> | EventConditionCreateWithoutEventInput[] | EventConditionUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventConditionCreateOrConnectWithoutEventInput | EventConditionCreateOrConnectWithoutEventInput[]
    upsert?: EventConditionUpsertWithWhereUniqueWithoutEventInput | EventConditionUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventConditionCreateManyEventInputEnvelope
    set?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    disconnect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    delete?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    connect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    update?: EventConditionUpdateWithWhereUniqueWithoutEventInput | EventConditionUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventConditionUpdateManyWithWhereWithoutEventInput | EventConditionUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventConditionScalarWhereInput | EventConditionScalarWhereInput[]
  }

  export type EventReferenceUrlUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput> | EventReferenceUrlCreateWithoutEventInput[] | EventReferenceUrlUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventReferenceUrlCreateOrConnectWithoutEventInput | EventReferenceUrlCreateOrConnectWithoutEventInput[]
    upsert?: EventReferenceUrlUpsertWithWhereUniqueWithoutEventInput | EventReferenceUrlUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventReferenceUrlCreateManyEventInputEnvelope
    set?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    disconnect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    delete?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    connect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    update?: EventReferenceUrlUpdateWithWhereUniqueWithoutEventInput | EventReferenceUrlUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventReferenceUrlUpdateManyWithWhereWithoutEventInput | EventReferenceUrlUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventReferenceUrlScalarWhereInput | EventReferenceUrlScalarWhereInput[]
  }

  export type EventStoreUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput> | EventStoreCreateWithoutEventInput[] | EventStoreUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventStoreCreateOrConnectWithoutEventInput | EventStoreCreateOrConnectWithoutEventInput[]
    upsert?: EventStoreUpsertWithWhereUniqueWithoutEventInput | EventStoreUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventStoreCreateManyEventInputEnvelope
    set?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    disconnect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    delete?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    connect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    update?: EventStoreUpdateWithWhereUniqueWithoutEventInput | EventStoreUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventStoreUpdateManyWithWhereWithoutEventInput | EventStoreUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventStoreScalarWhereInput | EventStoreScalarWhereInput[]
  }

  export type EventConditionUncheckedUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput> | EventConditionCreateWithoutEventInput[] | EventConditionUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventConditionCreateOrConnectWithoutEventInput | EventConditionCreateOrConnectWithoutEventInput[]
    upsert?: EventConditionUpsertWithWhereUniqueWithoutEventInput | EventConditionUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventConditionCreateManyEventInputEnvelope
    set?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    disconnect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    delete?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    connect?: EventConditionWhereUniqueInput | EventConditionWhereUniqueInput[]
    update?: EventConditionUpdateWithWhereUniqueWithoutEventInput | EventConditionUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventConditionUpdateManyWithWhereWithoutEventInput | EventConditionUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventConditionScalarWhereInput | EventConditionScalarWhereInput[]
  }

  export type EventReferenceUrlUncheckedUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput> | EventReferenceUrlCreateWithoutEventInput[] | EventReferenceUrlUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventReferenceUrlCreateOrConnectWithoutEventInput | EventReferenceUrlCreateOrConnectWithoutEventInput[]
    upsert?: EventReferenceUrlUpsertWithWhereUniqueWithoutEventInput | EventReferenceUrlUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventReferenceUrlCreateManyEventInputEnvelope
    set?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    disconnect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    delete?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    connect?: EventReferenceUrlWhereUniqueInput | EventReferenceUrlWhereUniqueInput[]
    update?: EventReferenceUrlUpdateWithWhereUniqueWithoutEventInput | EventReferenceUrlUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventReferenceUrlUpdateManyWithWhereWithoutEventInput | EventReferenceUrlUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventReferenceUrlScalarWhereInput | EventReferenceUrlScalarWhereInput[]
  }

  export type EventStoreUncheckedUpdateManyWithoutEventNestedInput = {
    create?: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput> | EventStoreCreateWithoutEventInput[] | EventStoreUncheckedCreateWithoutEventInput[]
    connectOrCreate?: EventStoreCreateOrConnectWithoutEventInput | EventStoreCreateOrConnectWithoutEventInput[]
    upsert?: EventStoreUpsertWithWhereUniqueWithoutEventInput | EventStoreUpsertWithWhereUniqueWithoutEventInput[]
    createMany?: EventStoreCreateManyEventInputEnvelope
    set?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    disconnect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    delete?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    connect?: EventStoreWhereUniqueInput | EventStoreWhereUniqueInput[]
    update?: EventStoreUpdateWithWhereUniqueWithoutEventInput | EventStoreUpdateWithWhereUniqueWithoutEventInput[]
    updateMany?: EventStoreUpdateManyWithWhereWithoutEventInput | EventStoreUpdateManyWithWhereWithoutEventInput[]
    deleteMany?: EventStoreScalarWhereInput | EventStoreScalarWhereInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type EventCreateWithoutConditionsInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    referenceUrls?: EventReferenceUrlCreateNestedManyWithoutEventInput
    stores?: EventStoreCreateNestedManyWithoutEventInput
  }

  export type EventUncheckedCreateWithoutConditionsInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    referenceUrls?: EventReferenceUrlUncheckedCreateNestedManyWithoutEventInput
    stores?: EventStoreUncheckedCreateNestedManyWithoutEventInput
  }

  export type EventCreateOrConnectWithoutConditionsInput = {
    where: EventWhereUniqueInput
    create: XOR<EventCreateWithoutConditionsInput, EventUncheckedCreateWithoutConditionsInput>
  }

  export type EventUpsertWithoutConditionsInput = {
    update: XOR<EventUpdateWithoutConditionsInput, EventUncheckedUpdateWithoutConditionsInput>
    create: XOR<EventCreateWithoutConditionsInput, EventUncheckedCreateWithoutConditionsInput>
    where?: EventWhereInput
  }

  export type EventUpdateToOneWithWhereWithoutConditionsInput = {
    where?: EventWhereInput
    data: XOR<EventUpdateWithoutConditionsInput, EventUncheckedUpdateWithoutConditionsInput>
  }

  export type EventUpdateWithoutConditionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    referenceUrls?: EventReferenceUrlUpdateManyWithoutEventNestedInput
    stores?: EventStoreUpdateManyWithoutEventNestedInput
  }

  export type EventUncheckedUpdateWithoutConditionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    referenceUrls?: EventReferenceUrlUncheckedUpdateManyWithoutEventNestedInput
    stores?: EventStoreUncheckedUpdateManyWithoutEventNestedInput
  }

  export type EventCreateWithoutReferenceUrlsInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionCreateNestedManyWithoutEventInput
    stores?: EventStoreCreateNestedManyWithoutEventInput
  }

  export type EventUncheckedCreateWithoutReferenceUrlsInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionUncheckedCreateNestedManyWithoutEventInput
    stores?: EventStoreUncheckedCreateNestedManyWithoutEventInput
  }

  export type EventCreateOrConnectWithoutReferenceUrlsInput = {
    where: EventWhereUniqueInput
    create: XOR<EventCreateWithoutReferenceUrlsInput, EventUncheckedCreateWithoutReferenceUrlsInput>
  }

  export type EventUpsertWithoutReferenceUrlsInput = {
    update: XOR<EventUpdateWithoutReferenceUrlsInput, EventUncheckedUpdateWithoutReferenceUrlsInput>
    create: XOR<EventCreateWithoutReferenceUrlsInput, EventUncheckedCreateWithoutReferenceUrlsInput>
    where?: EventWhereInput
  }

  export type EventUpdateToOneWithWhereWithoutReferenceUrlsInput = {
    where?: EventWhereInput
    data: XOR<EventUpdateWithoutReferenceUrlsInput, EventUncheckedUpdateWithoutReferenceUrlsInput>
  }

  export type EventUpdateWithoutReferenceUrlsInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUpdateManyWithoutEventNestedInput
    stores?: EventStoreUpdateManyWithoutEventNestedInput
  }

  export type EventUncheckedUpdateWithoutReferenceUrlsInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUncheckedUpdateManyWithoutEventNestedInput
    stores?: EventStoreUncheckedUpdateManyWithoutEventNestedInput
  }

  export type EventCreateWithoutStoresInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionCreateNestedManyWithoutEventInput
    referenceUrls?: EventReferenceUrlCreateNestedManyWithoutEventInput
  }

  export type EventUncheckedCreateWithoutStoresInput = {
    id?: string
    category: string
    name: string
    limitedQuantity?: number | null
    startDate: Date | string
    endDate?: Date | string | null
    endedAt?: Date | string | null
    isVerified?: boolean
    isPreliminary?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    conditions?: EventConditionUncheckedCreateNestedManyWithoutEventInput
    referenceUrls?: EventReferenceUrlUncheckedCreateNestedManyWithoutEventInput
  }

  export type EventCreateOrConnectWithoutStoresInput = {
    where: EventWhereUniqueInput
    create: XOR<EventCreateWithoutStoresInput, EventUncheckedCreateWithoutStoresInput>
  }

  export type EventUpsertWithoutStoresInput = {
    update: XOR<EventUpdateWithoutStoresInput, EventUncheckedUpdateWithoutStoresInput>
    create: XOR<EventCreateWithoutStoresInput, EventUncheckedCreateWithoutStoresInput>
    where?: EventWhereInput
  }

  export type EventUpdateToOneWithWhereWithoutStoresInput = {
    where?: EventWhereInput
    data: XOR<EventUpdateWithoutStoresInput, EventUncheckedUpdateWithoutStoresInput>
  }

  export type EventUpdateWithoutStoresInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUpdateManyWithoutEventNestedInput
    referenceUrls?: EventReferenceUrlUpdateManyWithoutEventNestedInput
  }

  export type EventUncheckedUpdateWithoutStoresInput = {
    id?: StringFieldUpdateOperationsInput | string
    category?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    limitedQuantity?: NullableIntFieldUpdateOperationsInput | number | null
    startDate?: DateTimeFieldUpdateOperationsInput | Date | string
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    isVerified?: BoolFieldUpdateOperationsInput | boolean
    isPreliminary?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    conditions?: EventConditionUncheckedUpdateManyWithoutEventNestedInput
    referenceUrls?: EventReferenceUrlUncheckedUpdateManyWithoutEventNestedInput
  }

  export type EventConditionCreateWithoutEventInput = {
    id?: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventConditionUncheckedCreateWithoutEventInput = {
    id?: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventConditionCreateOrConnectWithoutEventInput = {
    where: EventConditionWhereUniqueInput
    create: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput>
  }

  export type EventConditionCreateManyEventInputEnvelope = {
    data: EventConditionCreateManyEventInput | EventConditionCreateManyEventInput[]
  }

  export type EventReferenceUrlCreateWithoutEventInput = {
    id?: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventReferenceUrlUncheckedCreateWithoutEventInput = {
    id?: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventReferenceUrlCreateOrConnectWithoutEventInput = {
    where: EventReferenceUrlWhereUniqueInput
    create: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput>
  }

  export type EventReferenceUrlCreateManyEventInputEnvelope = {
    data: EventReferenceUrlCreateManyEventInput | EventReferenceUrlCreateManyEventInput[]
  }

  export type EventStoreCreateWithoutEventInput = {
    id?: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventStoreUncheckedCreateWithoutEventInput = {
    id?: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventStoreCreateOrConnectWithoutEventInput = {
    where: EventStoreWhereUniqueInput
    create: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput>
  }

  export type EventStoreCreateManyEventInputEnvelope = {
    data: EventStoreCreateManyEventInput | EventStoreCreateManyEventInput[]
  }

  export type EventConditionUpsertWithWhereUniqueWithoutEventInput = {
    where: EventConditionWhereUniqueInput
    update: XOR<EventConditionUpdateWithoutEventInput, EventConditionUncheckedUpdateWithoutEventInput>
    create: XOR<EventConditionCreateWithoutEventInput, EventConditionUncheckedCreateWithoutEventInput>
  }

  export type EventConditionUpdateWithWhereUniqueWithoutEventInput = {
    where: EventConditionWhereUniqueInput
    data: XOR<EventConditionUpdateWithoutEventInput, EventConditionUncheckedUpdateWithoutEventInput>
  }

  export type EventConditionUpdateManyWithWhereWithoutEventInput = {
    where: EventConditionScalarWhereInput
    data: XOR<EventConditionUpdateManyMutationInput, EventConditionUncheckedUpdateManyWithoutEventInput>
  }

  export type EventConditionScalarWhereInput = {
    AND?: EventConditionScalarWhereInput | EventConditionScalarWhereInput[]
    OR?: EventConditionScalarWhereInput[]
    NOT?: EventConditionScalarWhereInput | EventConditionScalarWhereInput[]
    id?: StringFilter<"EventCondition"> | string
    eventId?: StringFilter<"EventCondition"> | string
    type?: StringFilter<"EventCondition"> | string
    purchaseAmount?: IntNullableFilter<"EventCondition"> | number | null
    quantity?: IntNullableFilter<"EventCondition"> | number | null
    createdAt?: DateTimeFilter<"EventCondition"> | Date | string
    updatedAt?: DateTimeFilter<"EventCondition"> | Date | string
  }

  export type EventReferenceUrlUpsertWithWhereUniqueWithoutEventInput = {
    where: EventReferenceUrlWhereUniqueInput
    update: XOR<EventReferenceUrlUpdateWithoutEventInput, EventReferenceUrlUncheckedUpdateWithoutEventInput>
    create: XOR<EventReferenceUrlCreateWithoutEventInput, EventReferenceUrlUncheckedCreateWithoutEventInput>
  }

  export type EventReferenceUrlUpdateWithWhereUniqueWithoutEventInput = {
    where: EventReferenceUrlWhereUniqueInput
    data: XOR<EventReferenceUrlUpdateWithoutEventInput, EventReferenceUrlUncheckedUpdateWithoutEventInput>
  }

  export type EventReferenceUrlUpdateManyWithWhereWithoutEventInput = {
    where: EventReferenceUrlScalarWhereInput
    data: XOR<EventReferenceUrlUpdateManyMutationInput, EventReferenceUrlUncheckedUpdateManyWithoutEventInput>
  }

  export type EventReferenceUrlScalarWhereInput = {
    AND?: EventReferenceUrlScalarWhereInput | EventReferenceUrlScalarWhereInput[]
    OR?: EventReferenceUrlScalarWhereInput[]
    NOT?: EventReferenceUrlScalarWhereInput | EventReferenceUrlScalarWhereInput[]
    id?: StringFilter<"EventReferenceUrl"> | string
    eventId?: StringFilter<"EventReferenceUrl"> | string
    type?: StringFilter<"EventReferenceUrl"> | string
    url?: StringFilter<"EventReferenceUrl"> | string
    createdAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
    updatedAt?: DateTimeFilter<"EventReferenceUrl"> | Date | string
  }

  export type EventStoreUpsertWithWhereUniqueWithoutEventInput = {
    where: EventStoreWhereUniqueInput
    update: XOR<EventStoreUpdateWithoutEventInput, EventStoreUncheckedUpdateWithoutEventInput>
    create: XOR<EventStoreCreateWithoutEventInput, EventStoreUncheckedCreateWithoutEventInput>
  }

  export type EventStoreUpdateWithWhereUniqueWithoutEventInput = {
    where: EventStoreWhereUniqueInput
    data: XOR<EventStoreUpdateWithoutEventInput, EventStoreUncheckedUpdateWithoutEventInput>
  }

  export type EventStoreUpdateManyWithWhereWithoutEventInput = {
    where: EventStoreScalarWhereInput
    data: XOR<EventStoreUpdateManyMutationInput, EventStoreUncheckedUpdateManyWithoutEventInput>
  }

  export type EventStoreScalarWhereInput = {
    AND?: EventStoreScalarWhereInput | EventStoreScalarWhereInput[]
    OR?: EventStoreScalarWhereInput[]
    NOT?: EventStoreScalarWhereInput | EventStoreScalarWhereInput[]
    id?: StringFilter<"EventStore"> | string
    eventId?: StringFilter<"EventStore"> | string
    storeKey?: StringFilter<"EventStore"> | string
    createdAt?: DateTimeFilter<"EventStore"> | Date | string
    updatedAt?: DateTimeFilter<"EventStore"> | Date | string
  }

  export type EventConditionCreateManyEventInput = {
    id?: string
    type: string
    purchaseAmount?: number | null
    quantity?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventReferenceUrlCreateManyEventInput = {
    id?: string
    type: string
    url: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventStoreCreateManyEventInput = {
    id?: string
    storeKey: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EventConditionUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventConditionUncheckedUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventConditionUncheckedUpdateManyWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    purchaseAmount?: NullableIntFieldUpdateOperationsInput | number | null
    quantity?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlUncheckedUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventReferenceUrlUncheckedUpdateManyWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    url?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreUncheckedUpdateWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EventStoreUncheckedUpdateManyWithoutEventInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeKey?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}