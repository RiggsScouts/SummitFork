import React, { FocusEvent } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { DateSelectArg, DatesSetArg, EventClickArg, EventMountArg } from "@fullcalendar/core";
import SummitCalendarItem from "../models/SummitCalendarItems";
import { createNewEvent, deleteEvent, fetchActivity, fetchMemberCalendars, fetchMemberEvents, fetchUnitMembers, updateEvent, updateMemberCalendars } from "@/services";
import moment from "moment";
import { TerrainEvent, TerrainUnitMember, TerrrainCalendarResult } from "@/types/terrainTypes";
import { TerrainState, applyGroupedMultiSelectChange, buildGroupedMemberOptions, validateSummitCalendarActivity } from "@/helpers";
import { GroupedMultiSelectGroup } from "@/helpers/SummitCalendarValidation";
import TerrainEventItem from "../models/TerrainEventItem";
import { DatePickerComponent, TimePickerComponent } from "@/components/DateTimeInputs";
import { DropDownListComponent } from "@/components/SimpleDropdown";
import { DialogComponent, DialogUtility } from "@/components/DialogComponent";

interface SummitCalendarProps {
  items: SummitCalendarItem[];
  onUpdate: (items: SummitCalendarItem[]) => void;
}

interface SummitCalendarState {
  items: SummitCalendarItem[];
  sortState: { sortColumn: string; sortDirection: string };
  activity: TerrainEvent;
  editorIsLoading: boolean;
  isEditorOpen: boolean;
  members: { value: string; text: string }[];
  currentUnitID: string;
  unitMembers: TerrainUnitMember[];
  hideDialog: boolean;
  iframeKey: number;
  calendars: TerrrainCalendarResult;
  allCalendars: { id: string; name: string; selected: boolean }[];
  currentWindow: { startDate: string; endDate: string } | null;
}

export class SummitCalendarComponent extends React.Component<SummitCalendarProps, SummitCalendarState> {
  constructor(props: SummitCalendarProps) {
    super(props);
    this.state = {
      items: [],
      sortState: { sortColumn: "file", sortDirection: "ascending" },
      activity: { start_datetime: moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"), end_datetime: moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ") },
      editorIsLoading: false,
      isEditorOpen: false,
      members: [],
      currentUnitID: TerrainState.getUnitID(),
      unitMembers: [],
      hideDialog: true,
      iframeKey: 0,
      calendars: {},
      allCalendars: [],
      currentWindow: null,
    };
    this.handleInputChange = this.handleInputChange.bind(this);
  }

  componentDidMount() {
    this.fetchCalendars();
    this.fetchData();
  }

  fetchCalendars = async () => {
    const calendars = await fetchMemberCalendars();
    const allCalendars =
      calendars && calendars.own_calendars && calendars.other_calendars
        ? calendars.own_calendars
            ?.map((calendar) => ({ id: calendar.id, name: calendar.title, selected: calendar.selected }))
            .concat(calendars.other_calendars?.map((calendar) => ({ id: calendar.id, name: calendar.title, selected: calendar.selected })))
        : [];
    this.setState({ calendars: calendars, allCalendars: allCalendars });
  };

  fetchData = async (startDate?: string, endDate?: string) => {
    const unitMembers = await fetchUnitMembers();
    const members = unitMembers.map((member) => ({ value: member.id, text: member.first_name + " " + member.last_name }));
    this.setState({ members: members, unitMembers: unitMembers });

    const defaultStart = moment().startOf("month").format("YYYY-MM-DDTHH:mm:ss");
    const defaultEnd = moment().endOf("month").format("YYYY-MM-DDTHH:mm:ss");
    const rangeStart = startDate ?? this.state.currentWindow?.startDate ?? defaultStart;
    const rangeEnd = endDate ?? this.state.currentWindow?.endDate ?? defaultEnd;

    const data = await fetchMemberEvents(rangeStart, rangeEnd);
    const items = data.map((item) => new SummitCalendarItem(item));
    this.setState({
      items: items,
    });
    this.props.onUpdate(items);
  };

  handleDatesSet = (args: DatesSetArg) => {
    const startDate = moment(args.start).format("YYYY-MM-DDTHH:mm:ss");
    const endDate = moment(args.end).format("YYYY-MM-DDTHH:mm:ss");
    this.setState({ currentWindow: { startDate, endDate } }, () => {
      this.fetchData(startDate, endDate);
    });
  };

  eventDidMount = (args: EventMountArg) => {
    const item = args.event.extendedProps.item as SummitCalendarItem | undefined;
    if (item?.color) {
      args.el.style.backgroundColor = item.color;
      args.el.style.borderColor = item.color;
    }
  };

  handleEventClick = (args: EventClickArg) => {
    this.setState({ editorIsLoading: true, isEditorOpen: true });
    this.getActivity(args.event.id);
  };

  handleDateSelect = (args: DateSelectArg) => {
    if (args.allDay) {
      this.newActivity(moment(args.start).hour(19).minute(0).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"), moment(args.start).hour(21).minute(0).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"));
      return;
    }

    this.newActivity(moment(args.start).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"), moment(args.end).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"));
  };

  closeEditor = () => {
    this.setState({
      isEditorOpen: false,
      editorIsLoading: false,
      activity: { start_datetime: moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"), end_datetime: moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ") },
    });
  };

  getActivity = async (id: string) => {
    const activity = await fetchActivity(id);
    if (activity) {
      activity.start_datetime = moment(activity.start_datetime).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
      activity.end_datetime = moment(activity.end_datetime).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
      this.setState({ activity: activity, editorIsLoading: false, isEditorOpen: true });
    } else this.newActivity(moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"), moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"));
  };

  newActivity = async (startDate: string, endDate: string) => {
    const activity = {
      start_datetime: moment(startDate).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      end_datetime: moment(endDate).utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
    };
    this.setState({ activity: activity, editorIsLoading: false, isEditorOpen: true });
  };

  challangeAreas = [
    { text: "Community", value: "community" },
    { text: "Outdoors", value: "outdoors" },
    { text: "Creative", value: "creative" },
    { text: "Personal Growth", value: "personal_growth" },
  ];

  scoutMethodOptions = [
    { text: "Symbolic Framework", value: "symbolic_framework" },
    { text: "Community Involvement", value: "community_involvement" },
    { text: "Learning by Doing", value: "learn_by_doing" },
    { text: "Nature and Outdoors", value: "nature_and_outdoors" },
    { text: "Patrol System", value: "patrol_system" },
    { text: "Youth Lead Adult Support", value: "youth_leading_adult_supporting" },
    { text: "Promise & Law", value: "promise_and_law" },
    { text: "Personal Progression", value: "personal_progression" },
  ];

  handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    this.setState((prevState) => ({
      activity: {
        ...prevState.activity,
        [name]: value,
      },
    }));
  };

  handleDateTimeChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    //if name ends with time change name to be datetime and set previous values time but not date if it ends with date change name to be datetime and update the date but not the time of the previous value
    switch (name) {
      case "start_date":
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            start_datetime: moment(value).utc().format("YYYY-MM-DD") + "T" + moment(prevState.activity.start_datetime).utc().format("HH:mm:ss"),
          },
        }));
        break;
      case "start_time":
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            start_datetime: moment(prevState.activity.start_datetime).utc().format("YYYY-MM-DD") + "T" + moment(value).utc().format("HH:mm:ss"),
          },
        }));
        break;
      case "end_date":
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            end_datetime: moment(value).utc().format("YYYY-MM-DD") + "T" + moment(prevState.activity.end_datetime).utc().format("HH:mm:ss"),
          },
        }));
        break;
      case "end_time":
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            end_datetime: moment(prevState.activity.end_datetime).utc().format("YYYY-MM-DD") + "T" + moment(value).utc().format("HH:mm:ss"),
          },
        }));
        break;
    }
  };

  handleSelectChange = (event: { element: { id: string }; value: string | string[] }) => {
    switch (event.element.id) {
      case "challenge_area":
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            challenge_area: event.value ? event.value.toString().toLowerCase().replace(" ", "_") : "",
          },
        }));
        break;
      default:
        this.setState((prevState) => ({
          activity: {
            ...prevState.activity,
            [event.element.id]: event.value,
          },
        }));
        break;
    }
  };

  handleGroupedMultiSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValues = Array.from(event.target.selectedOptions).map((option) => option.value);
    const fieldId = event.target.id;

    this.setState((prevState) => ({
      activity: applyGroupedMultiSelectChange(prevState.activity, fieldId, selectedValues, this.state.unitMembers),
    }));
  };

  getScoutMethodGroups = (): GroupedMultiSelectGroup[] => {
    const programDesignValues = ["symbolic_framework", "community_involvement", "learn_by_doing", "nature_and_outdoors"];
    const leadershipValues = ["patrol_system", "youth_leading_adult_supporting", "promise_and_law", "personal_progression"];

    return [
      {
        label: "Program Design",
        options: this.scoutMethodOptions.filter((option) => programDesignValues.includes(option.value)).map((option) => ({ label: option.text, value: option.value })),
      },
      {
        label: "Leadership and Values",
        options: this.scoutMethodOptions.filter((option) => leadershipValues.includes(option.value)).map((option) => ({ label: option.text, value: option.value })),
      },
    ];
  };

  getCalendarGroups = (): GroupedMultiSelectGroup[] => {
    const ownCalendars = this.state.calendars.own_calendars ?? [];
    const otherCalendars = this.state.calendars.other_calendars ?? [];

    return [
      {
        label: "My Calendars",
        options: ownCalendars.map((calendar) => ({ label: calendar.title, value: calendar.id })),
      },
      {
        label: "Other Calendars",
        options: otherCalendars.map((calendar) => ({ label: calendar.title, value: calendar.id })),
      },
    ];
  };

  renderGroupedMultiSelect = (id: string, groups: GroupedMultiSelectGroup[], value: string[], disabled: boolean = false) => {
    const optionCount = groups.reduce((count, group) => count + group.options.length, 0);

    return (
      <select id={id} name={id} multiple={true} value={value} onChange={this.handleGroupedMultiSelectChange} disabled={disabled} className="e-input" size={Math.min(Math.max(optionCount, 4), 10)}>
        {groups.map((group) => (
          <optgroup key={`${id}-${group.label}`} label={group.label}>
            {group.options.map((option) => (
              <option key={`${id}-${group.label}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  };

  editorHeaderTemplate = () => {
    if (!this.state.activity?.id) return "New Event";
    else return this.state.activity?.title ?? "Event";
  };
  handleFocus = (e: FocusEvent) => {
    // Get the id of the relatedTarget
    const relatedTargetId = e.relatedTarget?.id;

    // List of ids of other date and time pickers
    const otherPickerIds = ["start_time", "end_date", "end_time"];

    // If the relatedTarget is one of the other pickers, stop the event propagation
    if (relatedTargetId && otherPickerIds.includes(relatedTargetId)) {
      e.stopPropagation();
    }
  };
  editorTemplate = () => {
    const { activity, currentUnitID } = this.state;
    const memberGroups = buildGroupedMemberOptions(this.state.unitMembers);
    const scoutMethodGroups = this.getScoutMethodGroups();
    const isEditable = (activity?.status !== "concluded" && currentUnitID === activity?.owner_id) || (activity && activity.id === undefined);
    return (
      <div className="editor-container">
        <label>
          Title <span style={{ color: "red" }}>*</span>
          <input className="e-input" type="text" name="title" value={activity?.title || ""} onChange={this.handleInputChange} disabled={!isEditable} data-msg-containerid="titleError" />
          <div id="titleError" />
        </label>
        <label>
          Location <span style={{ color: "red" }}>*</span>
          <input className="e-input" type="text" name="location" value={activity?.location || ""} onChange={this.handleInputChange} disabled={!isEditable} />
        </label>
        <label>
          Challenge Area <span style={{ color: "red" }}>*</span>
          <DropDownListComponent
            id="challenge_area"
            name="challenge_area"
            dataSource={this.challangeAreas}
            value={this.state.activity?.challenge_area}
            text={this.challangeAreas.find((c) => c.value == this.state.activity?.challenge_area)?.text}
            change={this.handleSelectChange}
            enabled={isEditable}
          />
          <div id="caError"></div>
        </label>
        <label>
          Start <span style={{ color: "red" }}>*</span>
          <DatePickerComponent
            id="start_date"
            value={new Date(activity?.start_datetime || new Date())}
            format="dd/MM/yy"
            onChange={this.handleDateTimeChange}
            name="start_date"
            disabled={!isEditable}
            showClearButton={false}
            onFocus={this.handleFocus}
          />
          <TimePickerComponent id="start_time" value={new Date(activity?.start_datetime || new Date())} format="hh:mm a" onChange={this.handleDateTimeChange} name="start_time" disabled={!isEditable} showClearButton={false} />
          End <span style={{ color: "red" }}>*</span>
          <DatePickerComponent id="end_date" value={new Date(activity?.end_datetime || new Date())} format="dd/MM/yy" onChange={this.handleDateTimeChange} name="end_date" disabled={!isEditable} showClearButton={false} />
          <TimePickerComponent id="end_time" value={new Date(activity?.end_datetime || new Date())} format="hh:mm a" onChange={this.handleDateTimeChange} name="end_time" disabled={!isEditable} showClearButton={false} />
        </label>
        <label>
          Scout Method <span style={{ color: "red" }}>*</span>
          {isEditable ? (
            this.renderGroupedMultiSelect("scout_method_elements", scoutMethodGroups, this.state.activity?.review?.scout_method_elements ?? [], !isEditable)
          ) : (
            <input
              className="e-input"
              value={activity?.review?.scout_method_elements
                .map((sm) => {
                  return this.scoutMethodOptions.find((smo) => smo.value == sm)?.text;
                })
                ?.join(", ")}
              disabled={true}
            />
          )}
        </label>
        <label>
          Organisers <span style={{ color: "red" }}>*</span>
          {isEditable ? (
            this.renderGroupedMultiSelect(
              "organisers",
              memberGroups,
              this.state.activity?.organisers?.map((i) => {
                return typeof i === "object" ? i.id : "";
              }) ?? [],
              !isEditable,
            )
          ) : (
            <input className="e-input" type="text" name="organisers" value={activity?.organisers?.map((i) => i.first_name + " " + i.last_name).join(", ")} disabled={true} />
          )}
        </label>
        <label>
          Leads
          {isEditable ? (
            this.renderGroupedMultiSelect(
              "leader_members",
              memberGroups,
              this.state.activity?.attendance?.leader_members?.map((i) => {
                return typeof i === "object" ? i.id : "";
              }) ?? [],
              !isEditable,
            )
          ) : (
            <input className="e-input" type="text" name="leads" value={activity?.attendance?.leader_members?.map((i) => i.first_name + " " + i.last_name).join(", ")} disabled={true} />
          )}
        </label>
        <label>
          Assists
          {this.renderGroupedMultiSelect(
            "assistant_members",
            memberGroups,
            this.state.activity?.attendance?.assistant_members?.map((i) => {
              return i?.id ?? "";
            }) ?? [],
            !isEditable,
          )}
        </label>
      </div>
    );
  };

  saveActivity = async (nextWeek?: boolean) => {
    const { activity } = this.state;
    if (!activity) return;
    console.log(activity);
    const validationResult = validateSummitCalendarActivity(activity);
    if (!validationResult.isValid) {
      const firstError = Object.values(validationResult.errors)[0];
      if (firstError) {
        alert(firstError);
      }
      return;
    }

    const eventToSave = new TerrainEventItem(activity);
    if (eventToSave.id) {
      await updateEvent(eventToSave.id, JSON.stringify(eventToSave));
      this.setState({ isEditorOpen: false });
      this.fetchData();
    }
    if (!eventToSave.id) {
      await createNewEvent(JSON.stringify(eventToSave));
      this.setState({ isEditorOpen: false });
      this.fetchData();
    }
    if (nextWeek) {
      setTimeout(() => {
        const newStartDatetime = moment(eventToSave.start_datetime).add(7, "days").utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
        const newEndDatetime = moment(eventToSave.end_datetime).add(7, "days").utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
        this.newActivity(newStartDatetime, newEndDatetime);
      }, 1000);
    }
  };

  openTerrainDialog = async () => {
    if (!this.state.activity?.id) {
      return;
    }

    const event = await fetchActivity(this.state.activity.id);
    window.$nuxt.$accessor.programming.setActivity(event);
    window.$nuxt.$accessor.programming.setActivityFlow("view");
    this.setState({ hideDialog: false });
    $("#eventFrame").attr("src", "https://terrain.scouts.com.au/programming/view-activity");
    $("#eventFrame").on("load", function () {
      const iframeHead = $(this).contents().find("head");
      const css =
        '<style type="text/css">' +
        `
      #freshworks-container, header, nav, footer {
        visibility: hidden; display: none;
      }
      main {
        padding: 0 !important;
      }
      .v-application .v-main__wrap .container {
        margin: 0 !important;
        max-width: 100% !important;
        padding: 0 !important;
    }
      ` +
        "</style>";
      $(iframeHead).append(css);
    });
  };

  editorFooterTemplate = () => {
    const { activity } = this.state;
    const isEditable = (activity?.status !== "concluded" && TerrainState.getUnitID() === activity?.owner_id) || (activity && activity.id === undefined);
    return isEditable ? (
      <div id="event-footer">
        <div id="right-button">
          {!activity?.id ? (
            <button id="Save" className="e-control e-btn e-primary" data-ripple="true" onClick={() => this.saveActivity(true)}>
              Save & Add Next Week
            </button>
          ) : (
            <button
              id="Delete"
              className="e-control e-btn e-danger"
              data-ripple="true"
              onClick={() => {
                const dialogObj = DialogUtility.confirm({
                  title: "Delete Item",
                  content: "Are you sure you want to permanently delete this item?",
                  width: "300px",
                  okButton: {
                    click: () => {
                      deleteEvent(this.state.activity?.id || "").then(() => {
                        dialogObj.hide();
                        this.setState({ isEditorOpen: false });
                        this.fetchData();
                      });
                    },
                  },
                  cancelButton: {
                    click: () => {
                      dialogObj.hide();
                    },
                  },
                });
              }}
            >
              Delete
            </button>
          )}
          {!!activity?.id && (
            <button id="open-modal" className="e-control e-btn e-secondary" data-ripple="true" onClick={this.openTerrainDialog}>
              Open in Terrain
            </button>
          )}
          <button id="Save" className="e-control e-btn e-primary" data-ripple="true" onClick={() => this.saveActivity()}>
            Save
          </button>
          <button id="Cancel" className="e-control e-btn e-secondary" data-ripple="true" onClick={this.closeEditor}>
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div id="event-footer">
        <div id="right-button">
          {!!activity?.id && (
            <button id="open-modal" className="e-control e-btn e-secondary" data-ripple="true" onClick={this.openTerrainDialog}>
              Open in Terrain
            </button>
          )}
          <button id="Cancel" className="e-control e-btn e-secondary" data-ripple="true" onClick={this.closeEditor}>
            Close
          </button>
        </div>
      </div>
    );
  };

  dialogButtons = [
    {
      click: () => {
        this.setState({ hideDialog: true });
      },
      buttonModel: { content: "Close Event", isPrimary: true, cssClass: "e-event-edit e-btn e-primary" },
    },
  ];

  handleCalendarChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCalendars = Array.from(event.target.selectedOptions).map((option) => option.value);
    const calendarUpdate = this.state.calendars;
    if (!calendarUpdate.own_calendars) return;
    calendarUpdate.own_calendars = calendarUpdate.own_calendars.map((calendar) => {
      return { ...calendar, selected: selectedCalendars.includes(calendar.id) };
    });
    calendarUpdate.other_calendars = calendarUpdate.other_calendars?.map((calendar) => {
      return { ...calendar, selected: selectedCalendars.includes(calendar.id) };
    });
    updateMemberCalendars(JSON.stringify(calendarUpdate)).then(() => {
      this.fetchData();
    });
  };

  render(): React.ReactNode {
    const events = this.state.items.map((item) => ({
      id: item.Id,
      title: item.Subject,
      start: item.StartTime,
      end: item.EndTime,
      backgroundColor: item.color,
      borderColor: item.color,
      extendedProps: {
        item,
      },
    }));

    return (
      <div id="scheduler" style={{ width: "100%", height: "100%" }}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          events={events}
          selectable={true}
          select={this.handleDateSelect}
          eventClick={this.handleEventClick}
          datesSet={this.handleDatesSet}
          eventDidMount={this.eventDidMount}
          height={"auto"}
        />
        <DialogComponent id="calendar-editor-dialog" isModal={true} visible={this.state.isEditorOpen} header={this.editorHeaderTemplate()} close={this.closeEditor} closeOnEscape={true} showCloseIcon={true}>
          {this.state.editorIsLoading ? <div>Loading event...</div> : this.editorTemplate()}
          {!this.state.editorIsLoading && this.editorFooterTemplate()}
        </DialogComponent>
        Select Calendars
        <select id="calendarSelector" name="calendarSelector" multiple={true} value={this.state.allCalendars.filter((c) => c.selected).map((c) => c.id)} onChange={this.handleCalendarChange} className="e-input" size={8}>
          {this.getCalendarGroups().map((group) => (
            <optgroup key={`calendar-${group.label}`} label={group.label}>
              {group.options.map((option) => (
                <option key={`calendar-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <DialogComponent
          id="dialog"
          isModal={true}
          visible={!this.state.hideDialog}
          header="View Event"
          target="#scheduler"
          animationSettings={{ effect: "None" }}
          close={() => {
            $("#eventFrame").attr("src", "about:blank");
            this.setState({ hideDialog: true });
            this.fetchData();
          }}
          closeOnEscape={true}
          showCloseIcon={true}
          cssClass="summit-dialog-max-size"
          buttons={this.dialogButtons}
        >
          <iframe id="eventFrame" src="about:blank" title="Modal Content" style={{ width: "100%", height: "100%" }} />
        </DialogComponent>
      </div>
    ) as React.ReactNode;
  }
}
