import React, {Suspense, lazy} from 'react';
import {dateFormat, pagination, siteName, storage, validation, defaultEventStageName} from '../../mainroom.config';
import axios from 'axios';
import {displayErrorMessage, getAlert, LoadingSpinner} from '../utils/displayUtils';
import {
    Alert,
    Button,
    Col,
    Container,
    Dropdown,
    DropdownToggle,
    Modal,
    ModalBody, ModalFooter,
    ModalHeader, Progress,
    Row,
    Spinner
} from 'reactstrap';
import {Link} from 'react-router-dom';
import {convertLocalToUTC, formatDateRange, isTimeBetween} from '../utils/dateUtils';
import PlusIcon from '../icons/plus-white.svg';
import DateTimeRangeContainer from 'react-advanced-datetimerange-picker';
import moment from 'moment';
import AddIcon from '../icons/plus-white-20.svg';
import RemoveIcon from '../icons/x.svg';

const ImageUploader = lazy(() => import('react-images-upload'));

const STARTING_PAGE = 1;

export default class Events extends React.Component {

    constructor(props) {
        super(props);

        this.toggleCreateEvent = this.toggleCreateEvent.bind(this);
        this.setEventName = this.setEventName.bind(this);
        this.eventApplyDate = this.eventApplyDate.bind(this);
        this.setTags = this.setTags.bind(this);
        this.createEvent = this.createEvent.bind(this);
        this.onBannerImageUpload = this.onBannerImageUpload.bind(this);
        this.onEventThumbnailUpload = this.onEventThumbnailUpload.bind(this);
        this.addStage = this.addStage.bind(this);
        this.setStageName = this.setStageName.bind(this);
        this.removeStage = this.removeStage.bind(this);
        this.onStageSplashThumbnailUpload = this.onStageSplashThumbnailUpload.bind(this);

        this.state = {
            events: [],
            createEventOpen: false,
            loggedInUserId: '',
            eventName: '',
            eventStartTime: moment().add(1, 'hour'),
            eventEndTime: moment().add(2, 'hour'),
            eventTags: [],
            stages: [{
                stageName: defaultEventStageName,
                uploadedSplashThumbnail: undefined
            }],
            uploadedBannerImage: undefined,
            uploadedEventThumbnail: undefined,
            nextPage: STARTING_PAGE,
            showLoadMoreButton: false,
            showLoadMoreSpinner: false,
            showCreateEventSpinnerAndProgress: false,
            createEventProgress: 0,
            createEventErrorMessage: '',
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        document.title = `Events - ${siteName}`;
        this.getEvents()
        this.getLoggedInUserId();
    }

    getEvents() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                const res = await axios.get('/api/events', {
                    params: {
                        page: this.state.nextPage,
                        limit: pagination.large
                    }
                });
                this.setState({
                    events: [...this.state.events, ...(res.data.events || [])],
                    nextPage: res.data.nextPage,
                    showLoadMoreButton: !!res.data.nextPage,
                    loaded: true,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more events. Please try again later. (${err})`);
            }
        });
    }

    async getLoggedInUserId() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data._id) {
            this.setState({
                loggedInUserId: res.data._id
            });
        }
    }

    toggleCreateEvent() {
        if (!this.state.loggedInUserId) {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        } else {
            this.setState(prevState => ({
                createEventOpen: !prevState.createEventOpen
            }));
        }
    }

    setEventName(e) {
        this.setState({
            eventName: e.target.value
        });
    }

    getDatePickerRange() {
        return {
            'Next 6 Hours': [moment(), moment().add(6, 'hours')],
            'Next 12 Hours': [moment(), moment().add(12, 'hours')],
            'Next 24 Hours': [moment(), moment().add(24, 'hours')],
            'Today': [moment().startOf('day'), moment().endOf('day')],
            'Tomorrow': [moment().startOf('day').add(1, 'day'), moment().endOf('day').add(1, 'day')],
            'Next 3 Days': [moment().startOf('day'), moment().add(3, 'days').startOf('day')],
            'Next 7 Days': [moment().startOf('day'), moment().add(1, 'week').startOf('day')],
            'This Weekend': [moment().isoWeekday('Saturday').startOf('day'), moment().isoWeekday('Sunday').endOf('day')],
            'This Week': [moment().startOf('isoWeek'), moment().endOf('isoWeek')],
            'Next Weekend': [moment().isoWeekday('Saturday').startOf('day').add(1, 'week'), moment().isoWeekday('Sunday').endOf('day').add(1, 'week')],
            'Next Week': [moment().startOf('isoWeek').add(1, 'week'), moment().endOf('isoWeek').add(1, 'week')]
        };
    }

    getDatePickerFormat() {
        return {
            'format': dateFormat,
            'sundayFirst': false
        };
    }

    isNoMobileMode() {
        const mdBreakpointValue = window.getComputedStyle(document.documentElement)
            .getPropertyValue('--breakpoint-md')
            .replace('px', '');
        return window.screen.width >= mdBreakpointValue;
    }

    eventApplyDate(startTime, endTime) {
        this.setState({
            eventStartTime: startTime,
            eventEndTime: endTime
        });
    }

    setTags(event) {
        const tags = event.target.value.replace(/\s/g, '').split(',');
        if (tags.length > validation.event.tagsMaxAmount) {
            return;
        }
        this.setState({
            eventTags: tags
        });
    }

    onBannerImageUpload(pictureFiles) {
        this.setState({
            uploadedBannerImage: pictureFiles[0]
        });
    }

    onEventThumbnailUpload(pictureFiles) {
        this.setState({
            uploadedEventThumbnail: pictureFiles[0]
        });
    }

    setStageName(e, index) {
        const stages = this.state.stages;
        stages[index].stageName = event.target.value;
        this.setState({stages});
    }

    addStage() {
        if (this.state.stages.length === validation.event.stagesMaxAmount) {
            return;
        }
        this.setState({
            stages: [...this.state.stages, {
                stageName: '',
                uploadedSplashThumbnail: undefined
            }]
        });
    }

    removeStage(index) {
        const stages = this.state.stages;
        stages.splice(index, 1);
        this.setState({stages});
    }

    onStageSplashThumbnailUpload(pictureFiles, pictureData, index) {
        const stages = this.state.stages;
        stages[index].uploadedSplashThumbnail = pictureFiles[0];
        this.setState({stages});
    }

    createEvent() {
        this.setState({
            showCreateEventSpinnerAndProgress: true,
            createEventProgress: 0,
            createEventErrorMessage: ''
        }, async () => {
            let steps = this.state.stages.length + 1;
            if (this.state.uploadedBannerImage) steps++;
            if (this.state.uploadedEventThumbnail) steps++;
            const percentPerStep = (100 - this.state.createEventProgress) / steps;

            try {
                let res;
                try {
                    res = await axios.put('/api/events', {
                        userId: this.state.loggedInUserId,
                        eventName: this.state.eventName,
                        startTime: convertLocalToUTC(this.state.eventStartTime),
                        endTime: convertLocalToUTC(this.state.eventEndTime),
                        tags: this.state.eventTags,
                        stages: this.state.stages.map(stage => ({
                            stageName: stage.stageName
                        }))
                    });
                } catch (err) {
                    if (err.response.status === 403) {
                        return this.setState({
                            showCreateEventSpinnerAndProgress: false,
                            createEventProgress: 0,
                            createEventErrorMessage: err.response.data
                        });
                    }
                    throw err;
                }

                this.setState({createEventProgress: this.state.createEventProgress + percentPerStep});

                if (this.state.uploadedBannerImage) {
                    const data = new FormData();
                    data.set(storage.formDataKeys.event.bannerPic, this.state.uploadedBannerImage);

                    await axios.patch(`/api/events/${res.data.eventId}/banner-pic`, data, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    this.setState({createEventProgress: this.state.createEventProgress + percentPerStep});
                }

                if (this.state.uploadedEventThumbnail) {
                    const data = new FormData();
                    data.set(storage.formDataKeys.event.thumbnail, this.state.uploadedEventThumbnail);

                    await axios.patch(`/api/events/${res.data.eventId}/thumbnail`, data, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    this.setState({createEventProgress: this.state.createEventProgress + percentPerStep});
                }

                for (let i = 0; i < this.state.stages.length; i++) {
                    const uploadedStageSplashThumbnail = this.state.stages[i].uploadedSplashThumbnail;
                    if (uploadedStageSplashThumbnail) {
                        const eventStageId = res.data.eventStageIds[i];

                        const data = new FormData();
                        data.set(storage.formDataKeys.eventStage.splashThumbnail, uploadedStageSplashThumbnail);

                        await axios.patch(`/api/events/${res.data.eventId}/stage/${eventStageId}/splash-thumbnail`, data, {
                            headers: {
                                'Content-Type': 'multipart/form-data'
                            }
                        });
                    }

                    this.setState({createEventProgress: this.state.createEventProgress + percentPerStep});
                }

                window.location.href = `/event/${res.data.eventId}`;
            } catch (err) {
                displayErrorMessage(this, `An error occurred when creating event. Please try again later. (${err})`);
                this.toggleCreateEvent();
                this.setState({
                    showCreateEventSpinnerAndProgress: false,
                    createEventProgress: 0
                });
            }
        });
    }

    renderCreateStages() {
        return this.state.stages.map((stage, index) => (
            <Row className='mt-1' key={index}>
                <Col xs='12'>Stage Name</Col>
                <Col className={index !== 0 && 'remove-padding-r'} xs={index === 0 ? 12 : 11}>
                    <input className='rounded-border w-100' type='text' value={stage.stageName}
                           onChange={e => this.setStageName(e, index)}
                           maxLength={validation.eventStage.stageNameMaxLength}/>
                </Col>
                {index !== 0 && (
                    <Col className='remove-padding-l' xs='1'>
                        <a href='javascript:;' onClick={() => this.removeStage(index)}>
                            <img src={RemoveIcon} className='ml-2' alt='Remove Link icon'/>
                        </a>
                    </Col>
                )}
                <Col className='mt-2' xs='12'>
                    <details>
                        <summary>Splash Thumbnail <i>(optional)</i></summary>
                        <Suspense fallback={<LoadingSpinner />}>
                            <ImageUploader buttonText='Choose Splash Thumbnail'
                                           label='Maximum file size: 2MB | Recommended image size: 1280x720'
                                           maxFileSize={2 * 1024 * 1024}
                                           onChange={(files, pics) => this.onStageSplashThumbnailUpload(files, pics, index)}
                                           withPreview={true} singleImage={true} withIcon={false}/>
                        </Suspense>
                    </details>
                    {index < validation.event.stagesMaxAmount - 1 && <hr className='my-2'/>}
                </Col>
            </Row>
        ));
    }

    renderCreateEvent() {
        return this.state.createEventOpen && (
            <Modal isOpen={this.state.createEventOpen} toggle={this.toggleCreateEvent} centered={true}>
                <ModalHeader toggle={this.toggleCreateEvent}>
                    Create an Event
                </ModalHeader>
                <ModalBody>
                    <Container fluid className='remove-padding-lr'>
                        <Row>
                            <Col xs='12'>
                                <h5>Event Name</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='text' value={this.state.eventName}
                                       onChange={this.setEventName} maxLength={validation.event.eventNameMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Date & Time</h5>
                            </Col>
                            <Col xs='12'>
                                <DateTimeRangeContainer start={this.state.eventStartTime}
                                                        end={this.state.eventEndTime}
                                                        ranges={this.getDatePickerRange()}
                                                        local={this.getDatePickerFormat()}
                                                        noMobileMode={this.isNoMobileMode()}
                                                        applyCallback={this.eventApplyDate} autoApply
                                                        style={{standaloneLayout: {display: 'flex', maxWidth: 'fit-content'}}}>
                                    <Dropdown className='dropdown-hover-darkred' size='sm' toggle={() => {}}>
                                        <DropdownToggle caret>
                                            {formatDateRange({
                                                start: this.state.eventStartTime,
                                                end: this.state.eventEndTime
                                            })}
                                        </DropdownToggle>
                                    </Dropdown>
                                </DateTimeRangeContainer>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Tags</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='rounded-border w-100' type='text'
                                       value={this.state.eventTags} onChange={this.setTags}/>
                            </Col>
                            <Col xs='12'>
                                <i>Up to {validation.event.tagsMaxAmount} comma-separated tags, no spaces</i>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <details>
                                    <summary>Banner Image <i>(optional)</i></summary>
                                    <Suspense fallback={<LoadingSpinner />}>
                                        <ImageUploader buttonText='Choose Banner Image'
                                                       label='Maximum file size: 2MB | Recommended image size: 1110x200'
                                                       maxFileSize={2 * 1024 * 1024} onChange={this.onBannerImageUpload}
                                                       withPreview={true} singleImage={true} withIcon={false}/>
                                    </Suspense>
                                </details>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <details>
                                    <summary>Thumbnail <i>(optional)</i></summary>
                                    <Suspense fallback={<LoadingSpinner />}>
                                        <ImageUploader buttonText='Choose Thumbnail'
                                                       label='Maximum file size: 2MB | Recommended image size: 1280x720'
                                                       maxFileSize={2 * 1024 * 1024} onChange={this.onEventThumbnailUpload}
                                                       withPreview={true} singleImage={true} withIcon={false}/>
                                    </Suspense>
                                </details>
                            </Col>
                        </Row>
                    </Container>
                    <h5 className='mt-4'>Stages</h5>
                    <hr/>
                    <Container fluid className='remove-padding-lr'>
                        {this.renderCreateStages()}
                        {this.state.stages.length < validation.event.stagesMaxAmount && (
                            <Row className='mt-2'>
                                <Col xs='12'>
                                    <Button className='btn-dark' size='sm' onClick={this.addStage}>
                                        <img src={AddIcon} className='mr-1' alt='Add Stage icon'/>
                                        Add Stage
                                    </Button>
                                </Col>
                            </Row>
                        )}
                    </Container>
                    {this.state.showCreateEventSpinnerAndProgress && <Progress className='mt-2' value={this.state.createEventProgress} />}
                    <Alert className='mt-4' isOpen={!!this.state.createEventErrorMessage} color='danger'>
                        {this.state.createEventErrorMessage}
                    </Alert>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' onClick={this.createEvent}>
                        {this.state.showCreateEventSpinnerAndProgress && <Spinner size='sm' />}
                        <span className={this.state.showCreateEventSpinnerAndProgress && 'sr-only'}>
                            Create Event
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    render() {
        const timeNow = moment();

        const events = this.state.events.map((event, index) => {
            const isEventHappeningNow = isTimeBetween({
                time: timeNow,
                start: event.startTime,
                end: event.endTime
            });

            return (
                <Col className='stream margin-bottom-thick' key={index}>
                    {isEventHappeningNow && <span className='live-label'>LIVE</span>}
                    <Link to={`/event/${event._id}`}>
                        <img className='w-100' src={event.thumbnailURL} alt={`${event.eventName} Event Thumbnail`}/>
                    </Link>
                    <table>
                        <tbody>
                        <tr>
                            <td className='w-100'>
                                <h5 className='text-break'>
                                    <Link to={`/user/${event.createdBy.username}`}>
                                        {event.createdBy.displayName || event.createdBy.username}
                                    </Link>
                                    <span className='black-link'>
                                        <Link to={`/event/${event._id}`}>
                                            {` - ${event.eventName}`}
                                        </Link>
                                    </span>
                                </h5>
                                <h6>
                                    {formatDateRange({
                                        start: event.startTime,
                                        end: event.endTime
                                    })}
                                </h6>
                            </td>
                        </tr>
                        </tbody>
                    </table>
                </Col>
            );
        });

        const eventBoxes = events.length ? (
            <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                {events}
            </Row>
        ) : (
            <p className='my-4 text-center'>
                There are currently no upcoming events :(
            </p>
        );

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getEvents}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return (
            <React.Fragment>
                <Container fluid='lg' className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                    {getAlert(this)}

                    <Row>
                        <Col>
                            <Button className='btn-dark float-right' onClick={this.toggleCreateEvent}>
                                <img src={PlusIcon} width={22} height={22} className='mr-1'
                                     alt='Schedule a Stream icon'/>
                                Create an Event
                            </Button>
                            <h4>Events</h4>
                        </Col>
                    </Row>
                    <hr className='my-4'/>
                    {!this.state.loaded ? <LoadingSpinner /> : (
                        <React.Fragment>
                            {eventBoxes}
                            {loadMoreButton}
                        </React.Fragment>
                    )}
                </Container>

                {this.renderCreateEvent()}
            </React.Fragment>
        );
    }

}