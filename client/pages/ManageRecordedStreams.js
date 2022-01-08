import React from 'react';
import {
    Button,
    Col,
    Container,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Row,
    Spinner
} from 'reactstrap';
import {Link} from 'react-router-dom';
import axios from 'axios';
import {pagination, filters, siteName, validation} from '../../mainroom.config';
import {shortenNumber} from '../utils/numberUtils';
import {formatDate} from '../utils/dateUtils';
import {
    displayErrorMessage,
    displayGenreAndCategory,
    displaySuccessMessage,
    getAlert,
    LoadingSpinner
} from '../utils/displayUtils';
import DownloadIcon from '../icons/download.svg';
import EditIcon from '../icons/edit.svg';
import DeleteIcon from '../icons/trash.svg';
import WhiteDeleteIcon from '../icons/trash-white-20.svg';
import ViewersIcon from '../icons/eye.svg';

const STARTING_PAGE = 1;

export default class ManageRecordedStreams extends React.Component {

    constructor(props) {
        super(props);

        this.editStreamToggle = this.editStreamToggle.bind(this);
        this.deleteStreamToggle = this.deleteStreamToggle.bind(this);
        this.genreDropdownToggle = this.genreDropdownToggle.bind(this);
        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.setTitle = this.setTitle.bind(this);
        this.setGenre = this.setGenre.bind(this);
        this.clearGenre = this.clearGenre.bind(this);
        this.setCategory = this.setCategory.bind(this);
        this.clearCategory = this.clearCategory.bind(this);
        this.setTags = this.setTags.bind(this);
        this.editRecordedStream = this.editRecordedStream.bind(this);
        this.deleteRecordedStream = this.deleteRecordedStream.bind(this);
        this.getRecordedStreams = this.getRecordedStreams.bind(this);

        this.state = {
            loaded: false,
            loggedInUser: '',
            recordedStreams: [],
            dropdownState: [],
            selectedStreamIndex: undefined,
            selectedStreamId: '',
            selectedStreamTitle: '',
            selectedStreamGenre: '',
            selectedStreamCategory: '',
            selectedStreamTags: [],
            genres: [],
            categories: [],
            editStreamOpen: false,
            unsavedChanges: false,
            deleteStreamOpen: false,
            genreDropdownOpen: false,
            categoryDropdownOpen: false,
            showLoadMoreButton: false,
            showSaveChangesSpinner: false,
            showDeleteSpinner: false,
            alertIndex: undefined,
            isGlobalAlert: false,
            alertText: '',
            alertColor: '',
            nextPage: STARTING_PAGE
        }
    }

    componentDidMount() {
        document.title = `Manage Recorded Streams - ${siteName}`;
        this.getRecordedStreamsIfLoggedIn();
    }

    async getRecordedStreamsIfLoggedIn() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data.username) {
            this.setState({
                loggedInUser: res.data.username
            }, () => {
                this.getRecordedStreams();
            });
        } else {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        }
    }

    getRecordedStreams() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                const res = await axios.get(`/api/recorded-streams`, {
                    params: {
                        username: this.state.loggedInUser,
                        page: this.state.nextPage,
                        limit: pagination.large
                    }
                });
                const recordedStreams = [...this.state.recordedStreams, ...(res.data.recordedStreams || [])];
                this.setState({
                    recordedStreams,
                    dropdownState: new Array(recordedStreams.length).fill(false),
                    nextPage: res.data.nextPage,
                    showLoadMoreButton: !!res.data.nextPage,
                    loaded: true,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                this.setState({
                    isGlobalAlert: true,
                    showLoadMoreSpinner: false
                });
                displayErrorMessage(this, `An error occurred when loading more recorded streams. Please try again later. (${err})`);
            }
        });
    }

    dropdownToggle(index) {
        const dropdownState = [...this.state.dropdownState];
        dropdownState[index] = !dropdownState[index];
        this.setState({
            dropdownState
        });
    }

    async openEditRecordedStreamModal(index, stream) {
        this.setState({
            selectedStreamIndex: index,
            selectedStreamId: stream._id,
            selectedStreamTitle: stream.title,
            selectedStreamGenre: stream.genre,
            selectedStreamCategory: stream.category,
            selectedStreamTags: stream.tags
        }, () => {
            this.editStreamToggle();
        });
    }

    editStreamToggle() {
        this.setState(prevState => ({
            editStreamOpen: !prevState.editStreamOpen
        }), () => {
            if (this.state.editStreamOpen && !(this.state.genres.length || this.state.categories.length)) {
                this.getFilters();
            }
        });
    }

    getFilters() {
        const genres = filters.genres.map((genre, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setGenre}>{genre}</DropdownItem>
            </div>
        ));

        const categories = filters.categories.map((category, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setCategory}>{category}</DropdownItem>
            </div>
        ));

        this.setState({
            genres,
            categories
        });
    }

    genreDropdownToggle() {
        this.setState(prevState => ({
            genreDropdownOpen: !prevState.genreDropdownOpen
        }));
    }

    categoryDropdownToggle() {
        this.setState(prevState => ({
            categoryDropdownOpen: !prevState.categoryDropdownOpen
        }));
    }

    setTitle(event) {
        this.setState({
            selectedStreamTitle: event.target.value,
            unsavedChanges: true
        });
    }

    setGenre(event) {
        this.setState({
            selectedStreamGenre: event.currentTarget.textContent,
            unsavedChanges: true
        });
    }

    clearGenre() {
        this.setState({
            selectedStreamGenre: '',
            unsavedChanges: true
        });
    }

    setCategory(event) {
        this.setState({
            selectedStreamCategory: event.currentTarget.textContent,
            unsavedChanges: true
        });
    }

    clearCategory() {
        this.setState({
            selectedStreamCategory: '',
            unsavedChanges: true
        });
    }

    setTags(event) {
        const tags = event.target.value.replace(/\s/g, '').split(',');
        if (tags.length > validation.streamSettings.tagsMaxAmount) {
            return;
        }
        this.setState({
            selectedStreamTags: tags,
            unsavedChanges: true
        });
    }

    editRecordedStream() {
        this.setState({showSaveChangesSpinner: true}, async () => {
            try {
                const res = await axios.patch(`/api/recorded-streams/${this.state.selectedStreamId}`, {
                    title: this.state.selectedStreamTitle,
                    genre: this.state.selectedStreamGenre,
                    category: this.state.selectedStreamCategory,
                    tags: this.state.selectedStreamTags
                });

                const recordedStreams = [...this.state.recordedStreams];
                const recordedStream = recordedStreams[this.state.selectedStreamIndex];
                recordedStream.title = res.data.title;
                recordedStream.genre = res.data.genre;
                recordedStream.category = res.data.category;
                recordedStream.tags = res.data.tags;
                recordedStreams[this.state.selectedStreamIndex] = recordedStream;

                const alertText = `Successfully edited ${recordedStream.title ? `'${recordedStream.title}'` : 'recorded stream'}`;

                this.setState({
                    recordedStreams,
                    alertIndex: this.state.selectedStreamIndex
                }, () => {
                    displaySuccessMessage(this, alertText, () => {
                        this.setState({alertIndex: undefined});
                    });
                });
            } catch (err) {
                const alertText = `An error occurred when editing ${this.state.selectedStreamTitle ?
                    `'${this.state.selectedStreamTitle}'` : 'recorded stream'}. Please try again later. (${err})`;

                this.setState({
                    alertIndex: this.state.selectedStreamIndex
                }, () => {
                    displayErrorMessage(this, alertText, () => {
                        this.setState({alertIndex: undefined});
                    });
                });
            }

            this.editStreamToggle();
            this.setState({
                showSaveChangesSpinner: false,
                selectedStreamIndex: undefined,
                selectedStreamId: '',
                selectedStreamTitle: '',
                selectedStreamGenre: '',
                selectedStreamCategory: '',
                selectedStreamTags: []
            });
        });
    }

    openDeleteRecordedStreamModal(index, stream) {
        this.setState({
            selectedStreamIndex: index,
            selectedStreamId: stream._id,
            selectedStreamTitle: stream.title
        }, () => {
            this.deleteStreamToggle();
        });
    }

    deleteStreamToggle() {
        this.setState(prevState => ({
            deleteStreamOpen: !prevState.deleteStreamOpen
        }));
    }

    deleteRecordedStream() {
        this.setState({showDeleteSpinner: true}, async () => {
            try {
                await axios.delete(`/api/recorded-streams/${this.state.selectedStreamId}`);

                const recordedStreams = [...this.state.recordedStreams];
                recordedStreams.splice(this.state.selectedStreamIndex, 1);

                const alertText = `Successfully deleted ${this.state.selectedStreamTitle ?
                    `'${this.state.selectedStreamTitle}'` : 'recorded stream'}`

                this.setState({
                    recordedStreams,
                    alertIndex: this.state.selectedStreamIndex
                }, () => {
                    displaySuccessMessage(this, alertText, () => {
                        this.setState({alertIndex: undefined});
                    });
                });
            } catch (err) {
                const alertText = `An error occurred when deleting ${this.state.selectedStreamTitle ?
                    `'${this.state.selectedStreamTitle}'` : 'recorded stream'}. Please try again later. (${err})`;

                this.setState({
                    alertIndex: this.state.selectedStreamIndex
                }, () => {
                    displayErrorMessage(this, alertText, () => {
                        this.setState({alertIndex: undefined});
                    });
                });
            }

            this.deleteStreamToggle();
            this.setState({
                showDeleteSpinner: false,
                selectedStreamIndex: undefined,
                selectedStreamId: '',
                selectedStreamTitle: ''
            });
        });
    }

    renderEditRecordedStream() {
        return (
            <Modal isOpen={this.state.editStreamOpen} toggle={this.editStreamToggle} centered={true}>
                <ModalHeader toggle={this.editStreamToggle}>
                    Edit Recorded Stream
                </ModalHeader>
                <ModalBody>
                    <Container fluid className='remove-padding-lr'>
                        <Row>
                            <Col className='mt-2' xs='12'>
                                <h5>Title</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='text' value={this.state.selectedStreamTitle}
                                       onChange={this.setTitle} maxLength={validation.streamSettings.titleMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Genre</h5>
                            </Col>
                            <Col xs='12'>
                                <Dropdown className='dropdown-hover-darkred' isOpen={this.state.genreDropdownOpen}
                                          toggle={this.genreDropdownToggle} size='sm'>
                                    <DropdownToggle caret>
                                        {this.state.selectedStreamGenre || 'Select a genre...'}
                                    </DropdownToggle>
                                    <DropdownMenu>
                                        <DropdownItem onClick={this.clearGenre}
                                                      disabled={!this.state.selectedStreamGenre}>
                                            Clear Genre
                                        </DropdownItem>
                                        <DropdownItem divider/>
                                        {this.state.genres}
                                    </DropdownMenu>
                                </Dropdown>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Category</h5>
                            </Col>
                            <Col xs='12'>
                                <Dropdown className='dropdown-hover-darkred' isOpen={this.state.categoryDropdownOpen}
                                          toggle={this.categoryDropdownToggle} size='sm'>
                                    <DropdownToggle caret>
                                        {this.state.selectedStreamCategory || 'Select a category...'}
                                    </DropdownToggle>
                                    <DropdownMenu>
                                        <DropdownItem onClick={this.clearCategory}
                                                      disabled={!this.state.selectedStreamCategory}>
                                            Clear Category
                                        </DropdownItem>
                                        <DropdownItem divider/>
                                        {this.state.categories}
                                    </DropdownMenu>
                                </Dropdown>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Tags</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='rounded-border w-100-xs w-50-md' type='text'
                                       value={this.state.selectedStreamTags} onChange={this.setTags}/>
                                <i className='ml-1'>Up to {validation.streamSettings.tagsMaxAmount} comma-separated tags, no spaces</i>
                            </Col>
                        </Row>
                    </Container>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' onClick={this.editRecordedStream}
                            disabled={!this.state.unsavedChanges}>
                        {this.state.showSaveChangesSpinner && <Spinner size='sm'/>}
                        <span className={this.state.showSaveChangesSpinner && 'sr-only'}>
                            Save Changes
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    renderDeleteRecordedStream() {
        return (
            <Modal isOpen={this.state.deleteStreamOpen} toggle={this.deleteStreamToggle} size='md' centered={true}>
                <ModalHeader toggle={this.deleteStreamToggle}>
                    Delete Recorded Stream
                </ModalHeader>
                <ModalBody>
                    <p>Are you sure you want to delete '{this.state.selectedStreamTitle}'?</p>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-danger' onClick={this.deleteRecordedStream}>
                        {this.state.showDeleteSpinner && <Spinner size='sm'/>}
                        <span className={this.state.showDeleteSpinner && 'sr-only'}>
                            <img src={WhiteDeleteIcon} width={18} height={18} className='mr-2 mb-1'
                                 alt='Delete Recorded Stream icon'/>
                            Delete
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    renderRecordedStreams() {
        const recordedStreams = this.state.recordedStreams.map((stream, index) => {
            const dropdown = (
                <Dropdown className='float-right options-dropdown' isOpen={this.state.dropdownState[index]}
                          toggle={() => this.dropdownToggle(index)} size='sm'>
                    <DropdownToggle caret>
                        Options
                    </DropdownToggle>
                    <DropdownMenu right>
                        <DropdownItem href={stream.videoURL} download>
                            <img src={DownloadIcon} width={22} height={22} className='mr-3'
                                 alt='Download Recorded Stream icon'/>
                            Download
                        </DropdownItem>
                        <DropdownItem onClick={() => this.openEditRecordedStreamModal(index, stream)}>
                            <img src={EditIcon} width={22} height={22} className='mr-3'
                                 alt='Edit Recorded Stream icon'/>
                            Edit
                        </DropdownItem>
                        <DropdownItem onClick={() => this.openDeleteRecordedStreamModal(index, stream)}>
                            <img src={DeleteIcon} width={22} height={22} className='mr-3'
                                 alt='Delete Recorded Stream icon'/>
                            Delete
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            );

            const alert = this.state.alertIndex === index && getAlert(this);
            const nextHasAlert = this.state.alertIndex === index + 1;
            const requiresMargin = !(nextHasAlert && this.state.alertText);

            return (
                <React.Fragment key={index}>
                    {alert}
                    <Row className={requiresMargin && 'margin-bottom-thick'}>
                        <Col className='stream' md='6' lg='4'>
                            <span className='video-duration'>{stream.videoDuration}</span>
                            <span className='view-count'>
                                <img src={ViewersIcon} width={18} height={18} className='mr-1 my-1' alt='View icon'/>
                                {shortenNumber(stream.viewCount)}
                            </span>
                            <Link to={`/stream/${stream._id}`}>
                                <img className='w-100' src={stream.thumbnailURL}
                                     alt={`${stream.title} Stream Thumbnail`}/>
                            </Link>
                        </Col>
                        <Col md='6' lg='8'>
                            {dropdown}
                            <h5 className='black-link text-break'>
                                <Link to={`/stream/${stream._id}`}>
                                    {stream.title}
                                </Link>
                            </h5>
                            <h6>
                                {displayGenreAndCategory({
                                    genre: stream.genre,
                                    category: stream.category
                                })}
                            </h6>
                            <h6>{formatDate(stream.timestamp)}</h6>
                        </Col>
                    </Row>
                </React.Fragment>
            );
        });

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center mt-4'>
                <Button className='btn-dark' onClick={this.getRecordedStreams}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return (
            <React.Fragment>
                {recordedStreams.length ? recordedStreams : (
                    <Row>
                        <Col>
                            <p>You have no recorded streams. <Link to={'/go-live'}>Go live</Link> and we will record the stream for you!</p>
                        </Col>
                    </Row>
                )}
                {loadMoreButton}
            </React.Fragment>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <React.Fragment>
                <Container fluid='lg' className='my-5'>
                    {this.state.isGlobalAlert && getAlert(this)}

                    <Row>
                        <Col>
                            <h4>Manage Recorded Streams</h4>
                        </Col>
                    </Row>
                    <hr className='mt-4'/>
                    {this.renderRecordedStreams()}
                </Container>

                {this.renderEditRecordedStream()}
                {this.renderDeleteRecordedStream()}
            </React.Fragment>
        );
    }

}