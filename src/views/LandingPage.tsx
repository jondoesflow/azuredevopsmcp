import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Raise a passenger request</h1>
          <p className="govuk-body-l">
            Use this service to request passenger transport.
          </p>

          <p className="govuk-body">
            You will need passenger details, document information and preferred travel dates.
          </p>

          <div className="govuk-button-group">
            <Link to="/request" role="button" draggable="false" className="govuk-button" data-module="govuk-button">
              Start now
            </Link>
            <Link to="/admin" className="govuk-link">
              Admin queue
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
