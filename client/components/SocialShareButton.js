import React, {Fragment, Suspense, lazy} from 'react';
import {Modal, ModalBody, ModalHeader} from 'reactstrap';
import {LoadingSpinner} from '../utils/displayUtils';
import ShareIcon from '../icons/share.svg';

const FacebookShareButton = lazy(() => import('react-share/lib/FacebookShareButton'));
const FacebookIcon = lazy(() => import('react-share/lib/FacebookIcon'));
const FacebookMessengerShareButton = lazy(() => import('react-share/lib/FacebookMessengerShareButton'));
const FacebookMessengerIcon = lazy(() => import('react-share/lib/FacebookMessengerIcon'));
const TwitterShareButton = lazy(() => import('react-share/lib/TwitterShareButton'));
const TwitterIcon = lazy(() => import('react-share/lib/TwitterIcon'));
const WhatsappShareButton = lazy(() => import('react-share/lib/WhatsappShareButton'));
const WhatsappIcon = lazy(() => import('react-share/lib/WhatsappIcon'));
const RedditShareButton = lazy(() => import('react-share/lib/RedditShareButton'));
const RedditIcon = lazy(() => import('react-share/lib/RedditIcon'));
const EmailShareButton = lazy(() => import('react-share/lib/EmailShareButton'));
const EmailIcon = lazy(() => import('react-share/lib/EmailIcon'));

export default class SocialShareButton extends React.Component {

    constructor(props) {
        super(props);

        this.shareModalToggle = this.shareModalToggle.bind(this);

        this.state = {
            shareModalOpen: false
        };
    }

    shareModalToggle() {
        this.setState(prevState => ({
            shareModalOpen: !prevState.shareModalOpen
        }));
    }

    render() {
        return (
            <Fragment>
                <a href='javascript:;' onClick={this.shareModalToggle} title='Share'>
                    <img src={ShareIcon} className='float-right m-2' alt='Share button'/>
                </a>

                <Modal isOpen={this.state.shareModalOpen} toggle={this.shareModalToggle} centered={true} size='sm'>
                    <ModalHeader toggle={this.shareModalToggle}>
                        Share
                    </ModalHeader>
                    <ModalBody>
                        <Suspense fallback={<LoadingSpinner />}>
                            <FacebookShareButton className='m-1' url={window.location.href}>
                                <FacebookIcon size={80} round/>
                            </FacebookShareButton>
                            <TwitterShareButton className='m-1' url={window.location.href}>
                                <TwitterIcon size={80} round/>
                            </TwitterShareButton>
                            <FacebookMessengerShareButton className='m-1' url={window.location.href}>
                                <FacebookMessengerIcon size={80} round/>
                            </FacebookMessengerShareButton>
                            <WhatsappShareButton className='m-1' url={window.location.href}>
                                <WhatsappIcon size={80} round/>
                            </WhatsappShareButton>
                            <RedditShareButton className='m-1' url={window.location.href}>
                                <RedditIcon size={80} round/>
                            </RedditShareButton>
                            <EmailShareButton className='m-1' url={window.location.href}>
                                <EmailIcon size={80} round/>
                            </EmailShareButton>
                        </Suspense>
                    </ModalBody>
                </Modal>
            </Fragment>
        );
    }

}