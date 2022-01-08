import React, {Fragment} from 'react';
import videojs from 'video.js';
import axios from 'axios';
import {siteName, socketIOConnectionTimeout, loadLivestreamTimeout, headTitle} from '../../mainroom.config';
import {Link} from 'react-router-dom';
import {Button, Col, Container, Row} from 'reactstrap';
import io from 'socket.io-client';
import {ReactHeight} from 'react-height/lib/ReactHeight';
import {displayGenreAndCategory, LoadingSpinner} from '../utils/displayUtils';
import SocialShareButton from '../components/SocialShareButton';
import {formatDate} from '../utils/dateUtils';

const SCROLL_MARGIN_HEIGHT = 30;

export default class LiveStream extends React.Component {

    constructor(props) {
        super(props);

        this.onMessageTextChange = this.onMessageTextChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.onMessageSubmit = this.onMessageSubmit.bind(this);
        this.addMessageToChat = this.addMessageToChat.bind(this);
        this.startStreamFromSocket = this.startStreamFromSocket.bind(this);
        this.endStreamFromSocket = this.endStreamFromSocket.bind(this);
        this.updateStreamInfoFromSocket = this.updateStreamInfoFromSocket.bind(this);

        this.state = {
            stream: false,
            videoJsOptions: null,
            viewerUser: null,
            displayName: '',
            profilePicURL: '',
            event: undefined,
            streamKey: '',
            streamTitle: '',
            streamGenre: '',
            streamCategory: '',
            streamStartTime: '',
            socketIOURL: '',
            msg: '',
            chat: [],
            chatHeight: 0,
            chatInputHeight: 0,
            viewCount: 0,
            isConnectedToSocketIO: false
        }
    }

    componentDidMount() {
        document.title = headTitle;
        Promise.all([
            this.getStreamInfo(),
            this.getViewerUser()
        ]);
    }

    async getStreamInfo() {
        let url;
        if (this.props.match.params.username) {
            url = `/api/users/${this.props.match.params.username.toLowerCase()}/stream-info`;
        } else if (this.props.match.params.eventStageId) {
            url = `/api/events/${this.props.match.params.eventStageId}/stream-info`;
        } else {
            window.location.href = '/404';
        }

        try {
            const res = await axios.get(url);
            this.setState({
                socketIOURL: res.data.socketIOURL
            }, () => {
                if (!this.socket) {
                    this.connectToSocketIO();
                }
                if (res.data.isLive) {
                    this.populateStreamData(res.data);
                } else if (this.props.match.params.eventStageId && res.data.event && res.data.stageName) {
                    this.setState({
                        event: res.data.event,
                        eventStageName: res.data.stageName,
                    });
                }
            });
        } catch (err) {
            if (err.response.status === 404) {
                window.location.href = '/404';
            } else {
                throw err;
            }
        }
    }

    async populateStreamData(data) {
        this.setState({
            stream: true,
            videoJsOptions: {
                autoplay: true,
                controls: true,
                sources: [{
                    src: data.liveStreamURL,
                    type: 'application/x-mpegURL'
                }],
                fluid: true,
                aspectRatio: '16:9'
            },
            displayName: data.displayName,
            profilePicURL: data.profilePicURL,
            event: data.event,
            eventStageName: data.stageName,
            streamTitle: data.title,
            streamGenre: data.genre,
            streamCategory: data.category,
            streamStartTime: formatDate(data.startTime),
            viewCount: data.viewCount
        }, () => {
            this.player = videojs(this.videoNode, this.state.videoJsOptions);
            document.title = [
                (this.props.match.params.eventStageId ? this.state.eventStageName : (this.state.displayName || this.props.match.params.username.toLowerCase())),
                this.state.streamTitle,
                siteName
            ].filter(Boolean).join(' - ');
        });
    }

    async getViewerUser() {
        const res = await axios.get('/api/logged-in-user');
        this.setState({
            viewerUser: res.data
        });
    }

    connectToSocketIO() {
        // connect to socket.io server
        this.socket = io(this.state.socketIOURL, {transports: [ 'websocket' ]});

        //register listeners
        const streamer = this.props.match.params.username ? this.props.match.params.username.toLowerCase() : this.props.match.params.eventStageId;
        this.socket.on(`chatMessage_${streamer}`, this.addMessageToChat);
        this.socket.on(`streamStarted_${streamer}`, this.startStreamFromSocket);
        this.socket.on(`streamEnded_${streamer}`, this.endStreamFromSocket);
        this.socket.on(`streamInfoUpdated_${streamer}`, this.updateStreamInfoFromSocket);
        this.socket.on(`liveStreamViewCount_${streamer}`, viewCount => {
            this.setState({
                // liveStreamViewCount is the first event emitted from server after it receives a
                // `connection_${streamUsername}` event, so use this to test for successful connection
                isConnectedToSocketIO: true,
                viewCount
            });
        });

        // emit connection event
        this.socket.emit(`connection_${streamer}`);

        // retry on unsuccessful connection
        setTimeout(() => {
            if (!this.state.isConnectedToSocketIO) {
                this.disconnectFromSocketIO();
                this.setState({isConnectedToSocketIO: false}, () => {
                    this.connectToSocketIO();
                });
            }
        }, socketIOConnectionTimeout);
    }

    addMessageToChat({sender, msg}) {
        const displayName = this.state.viewerUser && sender.username === this.state.viewerUser.username
            ? <b>You:</b>
            : (sender.displayName || sender.username) + ':';

        const chatMessage = (
            <div className='ml-1' key={this.state.chat.length}>
                <span className='black-link' title={`Go to ${sender.displayName || sender.username}'s profile`}>
                    <Link to={`/user/${sender.username}`}>
                        <img src={sender.profilePicURL} width='25' height='25'
                             alt={`${sender.username} profile picture`} className='rounded-circle'/>
                        <span className='ml-1' style={{color: sender.chatColour}}>{displayName}</span>
                    </Link>
                </span>
                &nbsp;
                <span>{msg}</span>
            </div>
        );
        this.setState({
            chat: [...this.state.chat, chatMessage]
        });
    }

    startStreamFromSocket() {
        // When a user goes live, their view count is reset to 0 by the server, so this needs to be updated with the
        // current number of people viewing this page. This is done by emitting the connection_${streamer}
        // event for each user on this page, which increments the view count for streamUsername.
        const streamer = this.props.match.params.eventStageId ? this.props.match.params.eventStageId : this.props.match.params.username.toLowerCase();
        this.socket.emit(`connection_${streamer}`);

        // Stream is not available as soon as user goes live because .m3u8 playlist file needs to populate,
        // so wait a timeout (which needs to be longer than the time of each video segment) before loading.
        setTimeout(() => {
            if (this.state.stream === false) {
                this.getStreamInfo();
            }
        }, loadLivestreamTimeout);
    }

    endStreamFromSocket() {
        if (this.state.stream === true) {
            if (this.player) {
                this.player.dispose();
                this.player = null;
            }
            this.setState({
                stream: false,
                videoJsOptions: null,
                chat: []
            });
        }
    }

    updateStreamInfoFromSocket(streamInfo) {
        this.setState({
            streamTitle: streamInfo.title,
            streamGenre: streamInfo.genre,
            streamCategory: streamInfo.category
        });
    }

    componentWillUnmount() {
        this.disconnectFromSocketIO();
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
    }

    disconnectFromSocketIO() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    onMessageTextChange(e) {
        this.setState({
            msg: e.target.value
        });
    }

    handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.onMessageSubmit();
        }
    }

    onMessageSubmit() {
        if (this.state.msg) {
            const sender = this.state.viewerUser;
            const msg = this.state.msg;
            this.socket.emit('chatMessage', {sender, msg});
            this.setState({
                msg: ''
            });
        }
    }

    componentDidUpdate() {
        const messages = document.getElementById('messages');
        if (messages) {
            const isScrolledToBottom = messages.scrollHeight - messages.clientHeight <= messages.scrollTop + SCROLL_MARGIN_HEIGHT;
            if (isScrolledToBottom) {
                messages.scrollTop = messages.scrollHeight - messages.clientHeight;
            }
        }
    }

    setChatHeight(height) {
        if (height !== this.state.chatHeight) {
            this.setState({
                chatHeight: height
            });
        }
    }

    setChatInputHeight(height) {
        if (height !== this.state.chatInputHeight) {
            this.setState({
                chatInputHeight: height
            });
        }
    }

    renderChatInput() {
        return !(this.state.viewerUser && this.state.viewerUser.username) ? (
            <div className='text-center mt-3'>
                To participate in the chat, please <a href={`/login?redirectTo=${window.location.pathname}`}>log in</a>
            </div>
        ) : (
            <div className='chat-input' style={{height: this.state.chatInputHeight + 'px'}}>
                <textarea onChange={this.onMessageTextChange} onKeyDown={this.handleKeyDown} value={this.state.msg}/>
                <button onClick={this.onMessageSubmit}>Send</button>
            </div>
        );
    }

    render() {
        return this.state.stream ? (
            <Fragment>
                <Container fluid className='remove-padding-lr'>
                    <Row className='remove-margin-r no-gutters'>
                        <Col xs='12' md='9'>
                            <ReactHeight onHeightReady={height => this.setChatHeight(height)}>
                                <div data-vjs-player>
                                    <video ref={node => this.videoNode = node} className='video-js vjs-big-play-centered'/>
                                </div>
                            </ReactHeight>
                            <ReactHeight onHeightReady={height => this.setChatInputHeight(height)}>
                                <table>
                                    <tbody>
                                        <tr>
                                            {!this.props.match.params.eventStageId && (
                                                <td valign='top'>
                                                    <Link to={`/user/${this.props.match.params.username.toLowerCase()}`}>
                                                        <img className='rounded-circle m-2' src={this.state.profilePicURL}
                                                             width='75' height='75'
                                                             alt={`${this.props.match.params.username.toLowerCase()} profile picture`}/>
                                                    </Link>
                                                </td>
                                            )}
                                            <td className='w-100' valign='middle'>
                                                <h3 className='text-break'>
                                                    {this.props.match.params.eventStageId && this.state.eventStageName ? (
                                                        this.state.eventStageName
                                                    ) : (
                                                        <Link to={`/user/${this.props.match.params.username.toLowerCase()}`}>
                                                            {this.state.displayName || this.props.match.params.username.toLowerCase()}
                                                        </Link>
                                                    )}
                                                    {this.state.streamTitle ? ` - ${this.state.streamTitle}` : ''}
                                                </h3>
                                                <h6>
                                                    {displayGenreAndCategory({
                                                        genre: this.state.streamGenre,
                                                        category: this.state.streamCategory
                                                    })}
                                                </h6>
                                                <h6>
                                                    {this.state.viewCount} viewer{this.state.viewCount === 1 ? '' : 's'} · Started {this.state.streamStartTime}
                                                    {this.props.match.params.eventStageId && ' as part of '}
                                                    {this.props.match.params.eventStageId && (
                                                        <Link to={`/event/${this.state.event._id}`}>
                                                            {this.state.event.eventName}
                                                        </Link>
                                                    )}
                                                </h6>
                                            </td>
                                            <td className='w-100' valign='top'>
                                                <SocialShareButton />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </ReactHeight>
                        </Col>
                        <Col xs='12' md='3'>
                            <div id='messages' className='chat-messages' style={{height: this.state.chatHeight + 'px'}}>
                                {this.state.chat}
                            </div>
                            {this.renderChatInput()}
                        </Col>
                    </Row>
                </Container>
            </Fragment>
        ) : (
            <div className='mt-5 text-center'>
                {this.props.match.params.username ? (
                    <React.Fragment>
                        <h3>{this.props.match.params.username.toLowerCase()} is not currently live</h3>
                        <Button className='btn-dark mt-2' tag={Link} to={`/user/${this.props.match.params.username.toLowerCase()}`}>
                            Go To Profile
                        </Button>
                    </React.Fragment>
                ) : !this.state.event ? (<LoadingSpinner/>) : (
                    <React.Fragment>
                        <h3>
                            <Link to={`/event/${this.state.event._id}`}>
                                {this.state.event.eventName}
                            </Link> - {this.state.eventStageName} is not currently live</h3>
                        <Button className='btn-dark mt-2' tag={Link} to={`/event/${this.state.event._id}`}>
                            Go To Event
                        </Button>
                    </React.Fragment>
                )}
            </div>
        );
    }
}