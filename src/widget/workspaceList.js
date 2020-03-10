const { Clutter, GObject, St, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Tweener = imports.ui.tweener;
const DND = imports.ui.dnd;
const Me = ExtensionUtils.getCurrentExtension();
const { MatButton } = Me.imports.src.widget.material.button;
const { WorkspaceCategories } = Me.imports.src.msWorkspace.workspaceCategories;
const { DropPlaceholder } = Me.imports.src.widget.taskBar;
const { ShellVersionMatch } = Me.imports.src.utils.compatibility;

/* exported WorkspaceList */
var WorkspaceList = GObject.registerClass(
    class WorkspaceList extends St.Widget {
        _init(msWorkspaceManager) {
            super._init({
                clip_to_allocation: true,
                style_class: 'workspace-list'
            });

            this.msWorkspaceManager = msWorkspaceManager;

            this.buttonList = new St.BoxLayout({
                vertical: true
            });

            this.connect('destroy', this._onDestroy.bind(this));

            this.add_child(this.buttonList);
            this.dropPlaceholder = new DropPlaceholder(WorkspaceButton);
            this.dropPlaceholder.connect('drag-dropped', () => {
                this.tempDragData.workspaceButton.reparent(this.buttonList);
            });
            this.dropPlaceholder.connect('drag-over', () => {
                this.tempDragData.draggedOverByChild = true;
            });
            this.workspaceActiveIndicator = new St.Widget({
                style_class: 'workspace-active-indicator'
            });

            this.workspaceActiveIndicator.add_style_class_name('primary-bg');

            this.add_child(this.workspaceActiveIndicator);

            this.buildButtons();
            this.msWorkspaceManager.connect(
                'dynamic-super-workspaces-changed',
                () => {
                    this.buildButtons();
                }
            );
            this.workspaceSignal = global.workspace_manager.connect(
                'active-workspace-changed',
                () => {
                    this.activeButtonForIndex(
                        global.workspace_manager.get_active_workspace_index()
                    );
                }
            );

            this.activeButtonForIndex(
                global.workspace_manager.get_active_workspace_index()
            );
        }

        buildButtons() {
            log(
                'buildButtons',
                this.msWorkspaceManager.primaryMsWorkspaces.length
            );
            this.buttonList.remove_all_children();
            this.msWorkspaceManager.primaryMsWorkspaces.forEach(
                (msWorkspace, index) => {
                    let icon;
                    if (msWorkspace.category) {
                        icon = Gio.icon_new_for_string(
                            `${Me.path}/assets/icons/${msWorkspace.category.icon}.svg`
                        );
                    } else {
                        if (
                            index ===
                            this.msWorkspaceManager.primaryMsWorkspaces.length -
                                1
                        ) {
                            icon = Gio.icon_new_for_string(
                                `${Me.path}/assets/icons/plus-symbolic.svg`
                            );
                        } else {
                            icon = Gio.icon_new_for_string(
                                `${Me.path}/assets/icons/circle-symbolic.svg`
                            );
                        }
                    }
                    let workspaceButton = new WorkspaceButton(
                        this.msWorkspaceManager,
                        msWorkspace,
                        icon
                    );
                    workspaceButton._draggable.connect('drag-begin', () => {
                        let workspaceButtonIndex = this.msWorkspaceManager.categoryKeyOrderedList.indexOf(
                            workspaceButton.categoryKey
                        );
                        this.tempDragData = {
                            workspaceButton: workspaceButton,
                            initialIndex: workspaceButtonIndex
                        };
                        this.dropPlaceholder.resize(workspaceButton);
                        this.buttonList.add_child(this.dropPlaceholder);
                        this.buttonList.set_child_at_index(
                            this.dropPlaceholder,
                            workspaceButtonIndex
                        );
                        this.workspaceActiveIndicator.hide();
                    });

                    workspaceButton._draggable.connect('drag-cancelled', () => {
                        delete this.tempDragData.draggedOver;
                        delete this.tempDragData.draggedBefore;
                        this.buttonList.set_child_at_index(
                            this.dropPlaceholder,
                            this.tempDragData.initialIndex
                        );
                    });

                    workspaceButton._draggable.connect(
                        'drag-end',
                        this._onDragEnd.bind(this)
                    );

                    workspaceButton.connect('drag-over', (_, before) => {
                        this.tempDragData.draggedOverByChild = true;
                        this._onDragOver(workspaceButton, before);
                        //this.buttonList.set_child_before(this.dropPlaceholder, this.tempDragData.draggedBefore ? index : index + 1);
                    });

                    workspaceButton.connect('drag-dropped', () => {
                        this.tempDragData.workspaceButton.reparent(
                            this.buttonList
                        );
                    });
                    this.buttonList.add_child(workspaceButton);
                }
            );
        }

        handleDragOver() {
            if (!this.tempDragData.draggedOverByChild) {
                let workspaceButton =
                    this.items[this.items.length - 1] ===
                    this.tempDragData.workspaceButton
                        ? this.items[this.items.length - 2]
                        : this.items[this.items.length - 1];
                this._onDragOver(workspaceButton, false);
            } else {
                this.tempDragData.draggedOverByChild = false;
            }

            return DND.DragMotionResult.MOVE_DROP;
        }

        _onDragEnd() {
            this.buttonList.remove_child(this.dropPlaceholder);
            if (this.tempDragData.draggedOver) {
                let toIndex = this.msWorkspaceManager.categoryKeyOrderedList.indexOf(
                    this.tempDragData.draggedOver.categoryKey
                );
                if (this.tempDragData.draggedBefore) {
                    this.buttonList.set_child_at_index(
                        this.tempDragData.workspaceButton,
                        toIndex -
                            (this.tempDragData.initialIndex < toIndex ? 1 : 0)
                    );

                    this.msWorkspaceManager.setWorkspaceBefore(
                        this.tempDragData.workspaceButton.categoryKey,
                        this.tempDragData.draggedOver.categoryKey
                    );
                } else {
                    this.buttonList.set_child_at_index(
                        this.tempDragData.workspaceButton,
                        toIndex +
                            (this.tempDragData.initialIndex < toIndex ? 0 : 1)
                    );
                    this.msWorkspaceManager.setWorkspaceAfter(
                        this.tempDragData.workspaceButton.categoryKey,
                        this.tempDragData.draggedOver.categoryKey
                    );
                }
                //this.buttonList.set_child_at_index(this.tempDragData.item, this.tempDragData.draggedBefore ? index : index + 1);
            } else {
                this.buttonList.set_child_at_index(
                    this.tempDragData.workspaceButton,
                    this.tempDragData.initialIndex
                );
            }
            this.workspaceActiveIndicator.show();
            delete this.tempDragData;
        }

        _onDragOver(workspaceButton, before) {
            this.tempDragData.draggedOver = workspaceButton;
            this.tempDragData.draggedBefore = before;
            this.dropPlaceholder.resize(this.tempDragData.workspaceButton);
            let dropPlaceholderIndex = this.buttonList
                .get_children()
                .indexOf(this.dropPlaceholder);
            let workspaceButtonIndex = this.buttonList
                .get_children()
                .indexOf(workspaceButton);
            let toIndex =
                dropPlaceholderIndex < workspaceButtonIndex
                    ? workspaceButtonIndex - 1
                    : workspaceButtonIndex;
            if (this.tempDragData.draggedBefore) {
                this.buttonList.set_child_at_index(
                    this.dropPlaceholder,
                    toIndex
                );
            } else {
                this.buttonList.set_child_at_index(
                    this.dropPlaceholder,
                    toIndex + 1
                );
            }
        }

        activeButtonForIndex(index) {
            if (this.buttonActive) {
                if (
                    this.buttonActive.actorContainer.has_style_class_name(
                        'active'
                    )
                ) {
                    this.buttonActive.actorContainer.remove_style_class_name(
                        'active'
                    );
                }
            }
            this.buttonActive = this.buttonList.get_child_at_index(index);
            this.buttonActive.actorContainer.add_style_class_name('active');
            let scaleFactor = St.ThemeContext.get_for_stage(global.stage)
                .scale_factor;

            if (ShellVersionMatch('3.32')) {
                Tweener.addTween(this.workspaceActiveIndicator, {
                    translation_y: 48 * scaleFactor * index,
                    time: 0.25,
                    transition: 'easeOutQuad'
                });
            } else {
                this.workspaceActiveIndicator.ease({
                    translation_y: 48 * scaleFactor * index,
                    duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        }

        getButtonFromCategoryKey(categoryKey) {
            return this.buttonList.get_children().find(workspaceButton => {
                return workspaceButton.categoryKey === categoryKey;
            });
        }

        _onDestroy() {
            global.workspace_manager.disconnect(this.workspaceSignal);
        }
    }
);

var WorkspaceButton = GObject.registerClass(
    {
        Signals: {
            'drag-dropped': {},
            'drag-over': {
                param_types: [GObject.TYPE_BOOLEAN]
            }
        }
    },
    class InnerWorkspaceButton extends MatButton {
        _init(msWorkspaceManager, msWorkspace, gicon) {
            this.msWorkspaceManager = msWorkspaceManager;
            this.msWorkspace = msWorkspace;
            let icon = new St.Icon({
                gicon: gicon,
                style_class: 'mat-panel-button-icon'
            });
            super._init({
                child: icon,
                style_class: 'mat-panel-button'
            });
            this._delegate = this;

            this.connect('clicked', () => {
                this.msWorkspaceManager
                    .getWorkspaceOfMsWorkspace(this.msWorkspace)
                    .activate(global.get_current_time());
            });

            this.mouseData = {
                pressed: false,
                dragged: false,
                originalCoords: null,
                originalSequence: null
            };

            this.connect('event', (actor, event) => {
                let eventType = event.type();
                if (
                    [
                        Clutter.EventType.BUTTON_PRESS,
                        Clutter.EventType.TOUCH_BEGIN
                    ].indexOf(eventType) > -1
                ) {
                    this.mouseData.pressed = true;
                    this.mouseData.originalCoords = event.get_coords();
                    this.mouseData.originalSequence = event.get_event_sequence();
                } else if (
                    [
                        Clutter.EventType.MOTION,
                        Clutter.EventType.TOUCH_UPDATE
                    ].indexOf(eventType) > -1
                ) {
                    if (this.mouseData.pressed && !this.mouseData.dragged) {
                        let coords = event.get_coords();
                        let scaleFactor = St.ThemeContext.get_for_stage(
                            global.stage
                        ).scale_factor;
                        if (
                            Math.abs(
                                this.mouseData.originalCoords[0] - coords[0]
                            ) >
                                48 * scaleFactor &&
                            !this.mouseData.dragged
                        ) {
                            this.mouseData.dragged = true;
                            this._draggable.startDrag(
                                this.mouseData.originalCoords[0],
                                this.mouseData.originalCoords[1],
                                global.get_current_time(),
                                this.mouseData.originalSequence
                            );
                        }
                    }
                } else if (
                    [
                        Clutter.EventType.BUTTON_RELEASE,
                        Clutter.EventType.TOUCH_END
                    ].indexOf(eventType) > -1
                ) {
                    this.mouseData.pressed = false;
                    this.mouseData.dragged = false;
                } else if (eventType === Clutter.EventType.LEAVE) {
                    if (this.mouseData.pressed && !this.mouseData.dragged) {
                        this.mouseData.dragged = true;
                        this._draggable.startDrag(
                            this.mouseData.originalCoords[0],
                            this.mouseData.originalCoords[1],
                            global.get_current_time(),
                            this.mouseData.originalSequence
                        );
                    }
                }
            });

            this.initDrag();
        }
        initDrag() {
            this._draggable = DND.makeDraggable(this, {
                restoreOnSuccess: false,
                manualMode: true
            });

            this._draggable.connect('drag-end', () => {
                this.mouseData.pressed = false;
                this.mouseData.dragged = false;
            });
        }

        handleDragOver(source, actor, x, y) {
            if (!(source instanceof WorkspaceButton)) {
                return DND.DragMotionResult.NO_DROP;
            }
            this.emit('drag-over', y < this.height / 2);
            return DND.DragMotionResult.MOVE_DROP;
        }

        acceptDrop(source) {
            if (!(source instanceof WorkspaceButton)) {
                return false;
            }
            this.emit('drag-dropped');
            return true;
        }
    }
);