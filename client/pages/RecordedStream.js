import React, {Fragment} from 'react';
import videojs from 'video.js';
import axios from 'axios';
import {siteName, pagination, headTitle} from '../../mainroom.config';
import {Link} from 'react-router-dom';
import {Button, Col, Container, Row, Spinner} from 'reactstrap';
import {ReactHeight} from 'react-height/lib/ReactHeight';
import {formatDate, timeSince} from '../utils/dateUtils';
import {shortenNumber} from '../utils/numberUtils';
import {displayErrorMessage, displayGenreAndCategory, getAlert, LoadingSpinner} from '../utils/displayUtils';
import SocialShareButton from '../components/SocialShareButton';

const STARTING_PAGE = 1;

const STARTING_STATE = {
    loaded: false,
    videoJsOptions: null,
    username: '',
    displayName: '',
    profilePicURL: '',
    streamTitle: '',
    streamGenre: '',
    streamCategory: '',
    streamTimestamp: '',
    viewCount: 0,
    recordedStreams: [],
    videoHeight: 0,
    streamHeadingsHeight: 0,
    showLoadMoreButton: false,
    showLoadMoreSpinner: false,
    alertText: '',
    alertColor: '',
    nextPage: STARTING_PAGE
};

export default class RecordedStream extends React.Component {

    constructor(props) {
        super(props);

        this.getRecordedStreams = this.getRecordedStreams.bind(this);

        this.state = STARTING_STATE;
    }

    componentDidMount() {
        document.title = headTitle;
        this.fillComponent();
    }

    async fillComponent() {
        try {
            const res = await axios.get(`/api/recorded-streams/${this.props.match.params.streamId}`);
            if (res.data.recordedStream) {
                this.populateStreamData(res.data.recordedStream);
            }
        } catch (err) {
            if (err.response.status === 404) {
                window.location.href = '/404';
            } else {
                throw err;
            }
        }
    }

    populateStreamData(recordedStream) {
        this.setState({
            loaded: true,
            videoJsOptions: {
                autoplay: true,
                controls: true,
                sources: [{
                    src: recordedStream.videoURL,
                    type: 'video/mp4'
                }],
                fluid: true,
                aspectRatio: '16:9'
            },
            username: recordedStream.user.username,
            displayName: recordedStream.user.displayName,
            profilePicURL: recordedStream.user.profilePicURL,
            streamTitle: recordedStream.title,
            streamGenre: recordedStream.genre,
            streamCategory: recordedStream.category,
            streamTimestamp: formatDate(recordedStream.timestamp),
            streamTags: recordedStream.tags,
            viewCount: recordedStream.viewCount
        }, () => {
            this.player = videojs(this.videoNode, this.state.videoJsOptions);
            document.title = [
                (this.state.displayName || this.state.username),
                this.state.streamTitle,
                siteName
            ].filter(Boolean).join(' - ');
            this.getRecordedStreams();
        });
    }

    getRecordedStreams() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                const res = await axios.get(`/api/recorded-streams`, {
                    params: {
                        username: this.state.username,
                        tags: this.state.streamTags,
                        page: this.state.nextPage,
                        limit: pagination.small
                    }
                });
                this.setState({
                    recordedStreams: [...this.state.recordedStreams, ...(res.data.recordedStreams || [])],
                    nextPage: res.data.nextPage,
                    showLoadMoreButton: !!res.data.nextPage,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more streams. Please try again later. (${err})`);
            }
        });
    }

    componentDidUpdate(prevProps) {
        if (prevProps.match.params.streamId !== this.props.match.params.streamId) {
            this.setState(STARTING_STATE, () => this.fillComponent());
        }
    }

    componentWillUnmount() {
        if (this.player) {
            this.player.dispose()
        }
    }

    setVideoHeight(height) {
        if (height !== this.state.videoHeight) {
            this.setState({
                videoHeight: height
            });
        }
    }

    setStreamHeadingsHeight(height) {
        if (height !== this.state.streamHeadingsHeight) {
            this.setState({
                streamHeadingsHeight: height
            });
        }
    }

    renderRecordedStreams() {
        const recordedStreams = this.state.recordedStreams.map((stream, index) => {
            return stream._id !== this.props.match.params.streamId && (
                <Row key={index} className='mt-2 pl-2'>
                    <Col className='stream' xs='6'>
                        <span className='video-duration'>
                            {stream.videoDuration}
                        </span>
                        <Link to={`/stream/${stream._id}`}>
                            <img className='w-100' src={stream.thumbnailURL}
                                 alt={`${stream.title} Stream Thumbnail`}/>
                        </Link>
                    </Col>
                    <Col xs='6' className='remove-padding-lr'>
                        <div className='black-link text-break'>
                            <Link to={`/stream/${stream._id}`}>
                                {stream.title}
                            </Link>
                        </div>
                        <h6>
                            {displayGenreAndCategory({
                                genre: stream.genre,
                                category: stream.category
                            })}
                        </h6>
                        <h6>
                            {shortenNumber(stream.viewCount)} view{stream.viewCount === 1 ? '' : 's'} · {timeSince(stream.timestamp)}
                        </h6>
                    </Col>
                </Row>
            );
        });

        const loadMoreButton = this.state.showLoadMoreButton && recordedStreams.length > 0 && (
            <div className='text-center my-2'>
                <Button className='btn-dark' onClick={this.getRecordedStreams}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return (
            <div className='hide-scrollbar' style={{height: (this.state.videoHeight + this.state.streamHeadingsHeight) + 'px'}}>
                {recordedStreams.length ? recordedStreams
                    : <div className='my-3 text-center'>Could not find any suggested videos</div>}
                {loadMoreButton}
            </div>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <Fragment>
                <Container fluid className='remove-padding-lr'>
                    {getAlert(this)}

                    <Row className='remove-margin-r'>
                        <Col className='remove-padding-r' xs='12' md='9'>
                            <ReactHeight onHeightReady={height => this.setVideoHeight(height)}>
                                <div data-vjs-player>
                                    <video ref={node => this.videoNode = node} className='video-js vjs-big-play-centered'/>
                                </div>
                            </ReactHeight>
                            <ReactHeight onHeightReady={height => this.setStreamHeadingsHeight(height)}>
                                <table>
                                    <tbody>
                                        <tr>
                                            <td valign='top'>
                                                <Link to={`/user/${this.state.username}`}>
                                                    <img className='rounded-circle m-2' src={this.state.profilePicURL}
                                                         width='75' height='75'
                                                         alt={`${this.state.username} profile picture`}/>
                                                </Link>
                                            </td>
                                            <td className='w-100' valign='middle'>
                                                <h3 className='text-break'>
                                                    <Link to={`/user/${this.state.username}`}>
                                                        {this.state.displayName || this.state.username}
                                                    </Link>
                                                    {this.state.streamTitle ? ` - ${this.state.streamTitle}` : ''}
                                                </h3>
                                                <h6>
                                                    {displayGenreAndCategory({
                                                        genre: this.state.streamGenre,
                                                        category: this.state.streamCategory
                                                    })}
                                                </h6>
                                                <h6>
                                                    {this.state.viewCount} view{this.state.viewCount === 1 ? '' : 's'} · {this.state.streamTimestamp}
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
                        <Col xs='12' md='3' className='stream-sidebar'>
                            {this.renderRecordedStreams()}
                        </Col>
                    </Row>
                </Container>
            </Fragment>
        );
    }
}