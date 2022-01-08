import React from 'react';
import axios from 'axios';
import {
    Button,
    Container,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Row,
    Col,
    Spinner,
    Modal,
    ModalHeader,
    ModalBody,
    UncontrolledTooltip
} from 'reactstrap';
import {displayErrorMessage, displaySuccessMessage, getAlert, LoadingSpinner} from '../utils/displayUtils';
import {filters, siteName, storage, validation} from '../../mainroom.config';
import HelpIcon from '../icons/help-darkgrey-36.svg';

const INSTRUCTIONS_PATH = '/go-live-instructions'
const OBS_INSTRUCTIONS_PATH = `${INSTRUCTIONS_PATH}/obs`;
const XSPLIT_INSTRUCTIONS_PATH = `${INSTRUCTIONS_PATH}/xsplit`;

export default class GoLive extends React.Component {

    constructor(props) {
        super(props);

        this.generateStreamKey = this.generateStreamKey.bind(this);
        this.genreDropdownToggle = this.genreDropdownToggle.bind(this);
        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.setTitle = this.setTitle.bind(this);
        this.setGenre = this.setGenre.bind(this);
        this.clearGenre = this.clearGenre.bind(this);
        this.setCategory = this.setCategory.bind(this);
        this.clearCategory = this.clearCategory.bind(this);
        this.setTags = this.setTags.bind(this);
        this.saveSettings = this.saveSettings.bind(this);
        this.helpModalToggle = this.helpModalToggle.bind(this);

        this.state = {
            loaded: false,
            loggedInUser: '',
            genres: [],
            categories: [],
            genreDropdownOpen: false,
            categoryDropdownOpen: false,
            unsavedChanges: false,
            rtmpServerURL: '',
            streamKey: '',
            streamTitle: '',
            streamGenre: '',
            streamCategory: '',
            streamTags: [],
            showSpinner: false,
            isHelpModalOpen: false,
            alertText: '',
            alertColor: ''
        };
    }

    componentDidMount() {
        document.title = `Stream Settings - ${siteName}`;
        this.fillComponentIfLoggedIn();
    }

    async fillComponentIfLoggedIn() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data.username) {
            this.setState({
                loggedInUser: res.data.username
            }, () => {
                this.fillComponent();
            });
        } else {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        }
    }

    async fillComponent() {
        this.getFilters();
        await this.getStreamInfo();
        this.setState({loaded: true});
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

    async getStreamInfo() {
        const res = await axios.get(`/api/users/${this.state.loggedInUser}/stream-info`);
        this.setState({
            rtmpServerURL: res.data.rtmpServerURL,
            streamKey: res.data.streamKey,
            streamTitle: res.data.title,
            streamGenre: res.data.genre,
            streamCategory: res.data.category,
            streamTags: res.data.tags
        });
    }

    generateStreamKey() {
        this.setState({showSpinner: true}, async () => {
            try {
                const res = await axios.post(`/api/users/${this.state.loggedInUser}/stream-key`);
                this.setState({
                    streamKey: res.data.streamKey
                });
                displaySuccessMessage(this, 'Successfully generated a new stream key');
            } catch (err) {
                displayErrorMessage(this, `An error occurred when generating a new stream key. Please try again later. (${err})`);
            }
            this.setState({showSpinner: false});
        });
    }

    copyFrom(elementId) {
        document.getElementById(elementId).select();
        document.execCommand('copy');
        displaySuccessMessage(this, 'Copied to clipboard');
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
            streamTitle: event.target.value,
            unsavedChanges: true
        });
    }

    setGenre(event) {
        this.setState({
            streamGenre: event.currentTarget.textContent,
            unsavedChanges: true
        });
    }

    clearGenre() {
        this.setState({
            streamGenre: '',
            unsavedChanges: true
        });
    }

    setCategory(event) {
        this.setState({
            streamCategory: event.currentTarget.textContent,
            unsavedChanges: true
        });
    }

    clearCategory() {
        this.setState({
            streamCategory: '',
            unsavedChanges: true
        });
    }

    setTags(event) {
        const tags = event.target.value.replace(/\s/g, '').split(',');
        if (tags.length > validation.streamSettings.tagsMaxAmount) {
            return;
        }
        this.setState({
            streamTags: tags,
            unsavedChanges: true
        });
    }

    saveSettings() {
        this.setState({showSpinner: true}, async () => {
            try {
                const res = await axios.patch(`/api/users/${this.state.loggedInUser}/stream-info`, {
                    title: this.state.streamTitle,
                    genre: this.state.streamGenre,
                    category: this.state.streamCategory,
                    tags: this.state.streamTags
                });
                this.setState({
                    streamTitle: res.data.title,
                    streamGenre: res.data.genre,
                    streamCategory: res.data.category,
                    streamTags: res.data.tags,
                    unsavedChanges: false
                });
                displaySuccessMessage(this, 'Successfully updated stream settings');
            } catch (err) {
                displayErrorMessage(this, `An error occurred when updating stream settings. Please try again later. (${err})`);
            }
            this.setState({showSpinner: false});
        });
    }

    helpModalToggle() {
        this.setState(prevState => ({
            isHelpModalOpen: !prevState.isHelpModalOpen
        }));
    }

    renderHelpModal() {
        return (
            <Modal isOpen={this.state.isHelpModalOpen} toggle={this.helpModalToggle} centered={true} size='lg'>
                <ModalHeader toggle={this.helpModalToggle}>
                    Help
                </ModalHeader>
                <ModalBody>
                    <details className='mb-1'>
                        <summary>How to stream with OBS Studio</summary>
                        <ol>
                            <li><a href='https://obsproject.com/download'>Download OBS Studio</a> if you haven't already.</li>
                            <li>Open OBS Studio.</li>
                            <li>Select 'Settings'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/1_obs_settings.png`}
                                 alt="OBS Step 1: Select 'Settings'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Select 'Stream'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/2_obs_stream.png`}
                                 alt="OBS Step 2: Select 'Stream'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Open the 'Service' dropdown and select 'Custom...'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/3_obs_service.png`}
                                 alt="OBS Step 3: Open the 'Service' dropdown and select 'Custom...'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Copy the Server URL and paste it in the 'Server' text box.</li>
                            <li>Copy your Stream Key and paste it in the 'Stream Key' text box.</li>
                            <li>Select 'OK'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/4_obs_ok.png`}
                                 alt="OBS Step 4: Copy and paste Server URL and Stream Key into OBS, then select 'OK'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Select 'Start Streaming' to go live.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/5_obs_start.png`}
                                 alt="OBS Step 5: Select 'Start Streaming' to go live."
                                 className='mw-100 pr-40 mb-1' />
                            <li>To stop streaming, select 'Stop Streaming'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${OBS_INSTRUCTIONS_PATH}/6_obs_stop.png`}
                                 alt="OBS Step 6: To stop streaming, select 'Stop Streaming'."
                                 className='mw-100 pr-40 mb-1' />
                        </ol>
                    </details>
                    <details>
                        <summary>How to stream with XSplit Broadcaster</summary>
                        <ol>
                            <li><a href='https://www.xsplit.com/broadcaster/thank-you'>Download XSplit Broadcaster</a> if you haven't already.</li>
                            <li>Open XSplit Broadcaster.</li>
                            <li>Select 'Broadcast'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${XSPLIT_INSTRUCTIONS_PATH}/1_xsplit_broadcast.png`}
                                 alt="XSplit Step 1: Select 'Broadcast'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Open the 'Set up a new output' dropdown and select 'Custom RTMP'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${XSPLIT_INSTRUCTIONS_PATH}/2_xsplit_output.png`}
                                 alt="XSplit Step 2: Open the 'Set up a new output' dropdown and select 'Custom RTMP'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Choose any name for your output in the 'Name' text box.</li>
                            <li>Copy the Server URL and paste it in the 'RTMP URL' text box.</li>
                            <li>Copy your Stream Key and paste it in the 'Stream Key' text box.</li>
                            <li>Select 'OK'.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${XSPLIT_INSTRUCTIONS_PATH}/3_xsplit_ok.png`}
                                 alt="XSplit Step 3: Choose a channel Name, copy and paste Server URL and Stream Key into XSplit, then select 'OK'."
                                 className='mw-100 pr-40 mb-1' />
                            <li>Select 'Broadcast' then select your newly created output to go live.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${XSPLIT_INSTRUCTIONS_PATH}/4_xsplit_start.png`}
                                 alt="XSplit Step 4: Select 'Broadcast' then select your newly created output to go live."
                                 className='mw-100 pr-40 mb-1' />
                            <li>To stop streaming, select 'Broadcast' then select your newly created output.</li>
                            <img src={`https://${storage.cloudfront.staticContent}${XSPLIT_INSTRUCTIONS_PATH}/5_xsplit_stop.png`}
                                 alt="XSplit Step 5: To stop streaming, select 'Broadcast' then select your newly created output."
                                 className='mw-100 pr-40 mb-1' />
                        </ol>
                    </details>
                </ModalBody>
            </Modal>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <Container fluid='lg'>
                {getAlert(this)}

                <Row className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                    <Col xs='12'>
                        <span className='float-right'>
                            <a href='javascript:;' id='help' onClick={this.helpModalToggle}>
                                <img src={HelpIcon} />
                            </a>
                            <UncontrolledTooltip target='help'>Help</UncontrolledTooltip>
                        </span>
                        <h4>Stream Settings</h4>
                    </Col>
                </Row>
                <hr className='mt-4'/>
                <Row>
                    <Col xs='12'>
                        <i>Copy and paste the Server URL and Stream Key into your streaming software</i>
                    </Col>
                </Row>
                <Row className='mt-3'>
                    <Col xs='12'>
                        <h5>Server URL</h5>
                    </Col>
                    <Col xs='12'>
                        <input id='serverUrlInput' className='rounded-border w-50-xs w-25-md' type='text'
                               value={this.state.rtmpServerURL} readOnly={true}/>
                        <Button className='btn-dark ml-1' size='sm'
                                onClick={() => this.copyFrom('serverUrlInput')}>
                            Copy
                        </Button>
                    </Col>
                    <Col className='mt-2' xs='12'>
                        <h5>Stream Key</h5>
                    </Col>
                    <Col xs='12'>
                        <input id='streamKeyInput' className='rounded-border w-50-xs w-25-md obfuscate-text' type='text'
                               value={this.state.streamKey} readOnly={true}/>
                        <Button className='btn-dark ml-1' size='sm'
                                onClick={() => this.copyFrom('streamKeyInput')}>
                            Copy
                        </Button>
                        <Button className='btn-dark ml-1' size='sm'
                                onClick={this.generateStreamKey}>
                            Generate new key
                        </Button>
                    </Col>
                    <Col className='mt-2' xs='12'>
                        <h5>Title</h5>
                    </Col>
                    <Col xs='12'>
                        <input className='w-100-xs w-50-md rounded-border' type='text' value={this.state.streamTitle}
                               onChange={this.setTitle} maxLength={validation.streamSettings.titleMaxLength} />
                    </Col>
                    <Col className='mt-2' xs='12'>
                        <h5>Genre</h5>
                    </Col>
                    <Col xs='12'>
                        <Dropdown className='dropdown-hover-darkred' isOpen={this.state.genreDropdownOpen}
                                  toggle={this.genreDropdownToggle} size='sm'>
                            <DropdownToggle caret>
                                {this.state.streamGenre || 'Select a genre...'}
                            </DropdownToggle>
                            <DropdownMenu>
                                <DropdownItem onClick={this.clearGenre} disabled={!this.state.streamGenre}>
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
                                {this.state.streamCategory || 'Select a category...'}
                            </DropdownToggle>
                            <DropdownMenu>
                                <DropdownItem onClick={this.clearCategory} disabled={!this.state.streamCategory}>
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
                        <input className='rounded-border w-100-xs w-25-md' type='text'
                               value={this.state.streamTags} onChange={this.setTags}/>
                        <i className='ml-1'>Up to {validation.streamSettings.tagsMaxAmount} comma-separated tags, no spaces</i>
                    </Col>
                </Row>
                <hr className='my-4'/>
                <div className='float-right mb-4'>
                    <Button className='btn-dark' size='lg' disabled={!this.state.unsavedChanges}
                            onClick={this.saveSettings}>
                        {this.state.showSpinner && <Spinner />}
                        <span className={this.state.showSpinner && 'sr-only'}>
                            Save Settings
                        </span>
                    </Button>
                </div>

                {this.renderHelpModal()}
            </Container>
        );
    }
}