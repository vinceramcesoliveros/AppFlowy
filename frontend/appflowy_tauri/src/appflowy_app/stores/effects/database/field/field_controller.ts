import { Log } from '../../../../utils/log';
import { DatabaseBackendService } from '../database_bd_svc';
import { DatabaseFieldChangesetObserver } from './field_observer';
import { FieldIdPB, FieldPB, IndexFieldPB } from '../../../../../services/backend/models/flowy-database/field_entities';
import { ChangeNotifier } from '../../../../utils/change_notifier';

export class FieldController {
  private fieldListener: DatabaseFieldChangesetObserver;
  private backendService: DatabaseBackendService;
  private fieldNotifier = new FieldNotifier([]);

  constructor(public readonly viewId: string) {
    this.backendService = new DatabaseBackendService(viewId);
    this.fieldListener = new DatabaseFieldChangesetObserver(viewId);
  }

  dispose = async () => {
    this.fieldNotifier.unsubscribe();
    await this.fieldListener.unsubscribe();
  };

  get fieldInfos(): readonly FieldInfo[] {
    return this.fieldNotifier.fieldInfos;
  }

  getField = (fieldId: string): FieldInfo | undefined => {
    return this.fieldNotifier.fieldInfos.find((element) => element.field.id === fieldId);
  };

  loadFields = async (fieldIds: FieldIdPB[]) => {
    const result = await this.backendService.getFields(fieldIds);
    if (result.ok) {
      this.fieldNotifier.fieldInfos = result.val.map((field) => new FieldInfo(field));
    } else {
      Log.error(result.val);
    }
  };

  subscribeOnFieldsChanged = (callback?: (fieldInfos: readonly FieldInfo[]) => void) => {
    return this.fieldNotifier.observer.subscribe((fieldInfos) => {
      callback?.(fieldInfos);
    });
  };

  listenOnFieldChanges = async () => {
    await this.fieldListener.subscribe({
      onFieldsChanged: (result) => {
        if (result.ok) {
          const changeset = result.val;
          this._deleteFields(changeset.deleted_fields);
          this._insertFields(changeset.inserted_fields);
          this._updateFields(changeset.updated_fields);
        } else {
          Log.error(result.val);
        }
      },
    });
  };

  _deleteFields = (deletedFields: FieldIdPB[]) => {
    if (deletedFields.length === 0) {
      return;
    }

    const deletedFieldIds = deletedFields.map((field) => field.field_id);
    const predicate = (element: FieldInfo) => {
      !deletedFieldIds.includes(element.field.id);
    };
    const newFieldInfos = [...this.fieldInfos];
    newFieldInfos.filter(predicate);
    this.fieldNotifier.fieldInfos = newFieldInfos;
  };

  _insertFields = (insertedFields: IndexFieldPB[]) => {
    if (insertedFields.length === 0) {
      return;
    }
    const newFieldInfos = [...this.fieldInfos];
    insertedFields.forEach((insertedField) => {
      const fieldInfo = new FieldInfo(insertedField.field);
      if (newFieldInfos.length > insertedField.index) {
        newFieldInfos.splice(insertedField.index, 0, fieldInfo);
      } else {
        newFieldInfos.push(fieldInfo);
      }
    });
    this.fieldNotifier.fieldInfos = newFieldInfos;
  };

  _updateFields = (updatedFields: FieldPB[]) => {
    if (updatedFields.length === 0) {
      return;
    }

    const newFieldInfos = [...this.fieldInfos];
    updatedFields.forEach((updatedField) => {
      newFieldInfos.map((element) => {
        if (element.field.id === updatedField.id) {
          return updatedField;
        } else {
          return element;
        }
      });
    });
    this.fieldNotifier.fieldInfos = newFieldInfos;
  };
}

class FieldNotifier extends ChangeNotifier<FieldInfo[]> {
  constructor(private _fieldInfos: FieldInfo[]) {
    super();
  }

  set fieldInfos(newFieldInfos: FieldInfo[]) {
    if (this._fieldInfos !== newFieldInfos) {
      this._fieldInfos = newFieldInfos;
      this.notify(this._fieldInfos);
    }
  }

  /// Return a readonly list
  get fieldInfos(): FieldInfo[] {
    return this._fieldInfos;
  }
}

export class FieldInfo {
  constructor(public readonly field: FieldPB) {}
}
