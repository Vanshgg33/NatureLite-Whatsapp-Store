import { Model, Types, FilterQuery, UpdateQuery, QueryOptions, PipelineStage } from 'mongoose';

/**
 * Base repository wrapping a Mongoose model.
 * Entity-specific repositories extend this and add custom query methods.
 */
export abstract class BaseRepository<TDocument> {
  constructor(protected readonly model: Model<TDocument>) {}

  async findById(id: Types.ObjectId, options?: QueryOptions): Promise<TDocument | null> {
    return this.model.findById(id, null, options).exec();
  }

  async findByIdString(id: string, options?: QueryOptions): Promise<TDocument | null> {
    return this.model.findById(id, null, options).exec();
  }

  async findOne(filter: FilterQuery<TDocument>, options?: QueryOptions): Promise<TDocument | null> {
    return this.model.findOne(filter, null, options).exec();
  }

  async find(
    filter: FilterQuery<TDocument>,
    options?: QueryOptions & { skip?: number; limit?: number; sort?: Record<string, 1 | -1> },
  ): Promise<TDocument[]> {
    let query = this.model.find(filter);
    if (options?.sort) query = query.sort(options.sort);
    if (options?.skip != null) query = query.skip(options.skip);
    if (options?.limit != null) query = query.limit(options.limit);
    return query.exec();
  }

  async countDocuments(filter?: FilterQuery<TDocument>): Promise<number> {
    return this.model.countDocuments(filter ?? {}).exec();
  }

  async create(data: Partial<TDocument>): Promise<TDocument> {
    const doc = new this.model(data);
    return doc.save() as Promise<TDocument>;
  }

  async updateOne(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(filter, update).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async findByIdAndUpdate(
    id: Types.ObjectId | string,
    update: UpdateQuery<TDocument>,
    options?: QueryOptions & { new?: boolean },
  ): Promise<TDocument | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true, ...options }).exec();
  }

  async deleteOne(filter: FilterQuery<TDocument>): Promise<{ deletedCount: number }> {
    const result = await this.model.deleteOne(filter).exec();
    return { deletedCount: result.deletedCount };
  }

  async aggregate<T = unknown>(pipeline: PipelineStage[]): Promise<T[]> {
    return this.model.aggregate(pipeline).exec();
  }

  /** Expose model for complex operations until they are moved into repository methods. */
  getModel(): Model<TDocument> {
    return this.model;
  }
}
